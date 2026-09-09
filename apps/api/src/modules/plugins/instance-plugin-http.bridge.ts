import { Injectable, NotFoundException, Type, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { ModuleRef } from '@nestjs/core';
import { NestContainer } from '@nestjs/core/injector/container';
import { Module } from '@nestjs/core/injector/module';
import { MetadataScanner } from '@nestjs/core/metadata-scanner';
import { FastifyRequest } from 'fastify';
import { AppException } from '../../../../../packages/plugin-host/src/app-exception';
import {
  PLUGIN_NAME_KEY,
  PLUGIN_REGISTRY,
  type PluginRegistryLike,
} from '../../../../../packages/plugin-host/src/tokens';

type DispatchContext = {
  body: unknown;
  query: Record<string, unknown>;
  params: Record<string, string>;
  headers: Record<string, unknown>;
  raw: FastifyRequest;
};

type RouteEntry = {
  pluginName: string;
  handler: (ctx: DispatchContext) => Promise<unknown>;
};

const METHOD_NAME: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.OPTIONS]: 'OPTIONS',
  [RequestMethod.HEAD]: 'HEAD',
};

/** Fastify 5 forbids route() after listen — hot-loaded plugins register here instead. */
@Injectable()
export class InstancePluginHttpBridge {
  private readonly routes = new Map<string, RouteEntry>();
  private readonly container: NestContainer;
  private readonly scanner = new MetadataScanner();

  constructor(private readonly moduleRef: ModuleRef) {
    this.container = (moduleRef as unknown as { container: NestContainer }).container;
  }

  /** Register HTTP handlers from a lazy-loaded Nest module (boot + hotLoad). */
  registerModuleRoutes(moduleType: Type<unknown>, pluginNameFallback = ''): string[] {
    const nestModule = this.findLoadedModule(moduleType);
    if (!nestModule) return [];

    const paths: string[] = [];
    for (const wrapper of nestModule.controllers.values()) {
      const { metatype, instance } = wrapper;
      if (!metatype || !instance) continue;

      const controllerPath = Reflect.getMetadata(PATH_METADATA, metatype) ?? '';
      const pluginName =
        (Reflect.getMetadata(PLUGIN_NAME_KEY, metatype) as string | undefined) ||
        pluginNameFallback;

      for (const methodName of this.scanner.getAllMethodNames(metatype.prototype)) {
        const handlerRef = metatype.prototype[methodName];
        const method = Reflect.getMetadata(METHOD_METADATA, handlerRef) as
          RequestMethod | undefined;
        if (method === undefined || method === RequestMethod.ALL) continue;
        const verb = METHOD_NAME[method];
        if (!verb) continue;

        const methodPath = Reflect.getMetadata(PATH_METADATA, handlerRef);
        const fullPath = joinRoutePath(controllerPath, methodPath);
        const key = routeKey(verb, fullPath);

        this.routes.set(key, {
          pluginName,
          handler: (ctx) =>
            invokeControllerMethod(instance, metatype as Type<unknown>, methodName, ctx),
        });
        paths.push(`${verb} /api/${fullPath}`);
      }
    }
    return paths;
  }

  async dispatchRequest(req: FastifyRequest): Promise<unknown> {
    const path = pathFromRequestUrl(req.url ?? '');
    return this.dispatch(req.method ?? 'GET', path, req);
  }

  async dispatch(method: string, path: string, req?: FastifyRequest): Promise<unknown> {
    const entry = this.routes.get(routeKey(method, path));
    if (!entry) throw new NotFoundException();

    if (entry.pluginName) {
      const registry = this.registry();
      if (typeof registry.isEnabled === 'function') {
        if (!registry.isEnabled(entry.pluginName)) {
          throw AppException.pluginDisabled(entry.pluginName);
        }
      } else {
        const row = await registry.findByName(entry.pluginName);
        if (!row?.enabled) throw AppException.pluginDisabled(entry.pluginName);
      }
    }

    const ctx: DispatchContext = {
      body: req?.body,
      query: (req?.query ?? {}) as Record<string, unknown>,
      params: (req?.params ?? {}) as Record<string, string>,
      headers: (req?.headers ?? {}) as Record<string, unknown>,
      raw: req as FastifyRequest,
    };
    return entry.handler(ctx);
  }

  private registry(): PluginRegistryLike {
    return this.moduleRef.get(PLUGIN_REGISTRY, { strict: false });
  }

  unregisterPlugin(pluginName: string): void {
    for (const [key, entry] of this.routes.entries()) {
      if (entry.pluginName === pluginName) this.routes.delete(key);
    }
  }

  private findLoadedModule(moduleType: Type<unknown>): Module | undefined {
    for (const mod of this.container.getModules().values()) {
      if (mod.metatype === moduleType) return mod;
    }
    return undefined;
  }
}

async function invokeControllerMethod(
  instance: object,
  metatype: Type<unknown>,
  methodName: string,
  ctx: DispatchContext,
): Promise<unknown> {
  const metadata =
    (Reflect.getMetadata(ROUTE_ARGS_METADATA, metatype, methodName) as
      Record<string, { index: number; data?: unknown; pipes?: unknown[] }> | undefined) ?? {};

  const entries = Object.keys(metadata).map((key) => {
    const type = Number(key.split(':')[0]);
    const meta = metadata[key]!;
    return { type, index: meta.index, data: meta.data };
  });

  if (entries.length === 0) {
    return Promise.resolve(
      (instance as Record<string, (...args: unknown[]) => unknown>)[methodName].call(instance),
    );
  }

  const maxIndex = Math.max(...entries.map((e) => e.index));
  const args: unknown[] = new Array(maxIndex + 1).fill(undefined);
  for (const entry of entries) {
    switch (entry.type) {
      case RouteParamtypes.BODY:
        args[entry.index] = ctx.body;
        break;
      case RouteParamtypes.QUERY:
        args[entry.index] = typeof entry.data === 'string' ? ctx.query[entry.data] : ctx.query;
        break;
      case RouteParamtypes.PARAM:
        args[entry.index] = typeof entry.data === 'string' ? ctx.params[entry.data] : ctx.params;
        break;
      case RouteParamtypes.HEADERS:
        args[entry.index] = typeof entry.data === 'string' ? ctx.headers[entry.data] : ctx.headers;
        break;
      case RouteParamtypes.REQUEST:
        args[entry.index] = ctx.raw;
        break;
      default:
        args[entry.index] = undefined;
    }
  }

  return Promise.resolve(
    (instance as Record<string, (...args: unknown[]) => unknown>)[methodName].call(
      instance,
      ...args,
    ),
  );
}

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()}:${normalizePath(path)}`;
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+$/, '');
}

/** Strip query + optional `/api/` prefix from a Fastify request URL. */
export function pathFromRequestUrl(url: string): string {
  const pathOnly = url.split('?')[0] ?? '';
  return normalizePath(pathOnly.replace(/^\/api\//, '/'));
}

function joinRoutePath(controllerPath: string, methodPath: unknown): string {
  const ctrl = normalizePath(String(controllerPath ?? ''));
  const method =
    methodPath === undefined || methodPath === '/' ? '' : normalizePath(String(methodPath));
  if (!ctrl) return method;
  if (!method) return ctrl;
  return `${ctrl}/${method}`;
}
