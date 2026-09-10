import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  Type,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import {
  METHOD_METADATA,
  PARAMTYPES_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { NestContainer } from '@nestjs/core/injector/container';
import { Module } from '@nestjs/core/injector/module';
import { MetadataScanner } from '@nestjs/core/metadata-scanner';
import { FastifyRequest } from 'fastify';
import { AppException } from '../../../../../packages/plugin-host/src/app-exception';
import {
  PERMISSION_ANY_KEY,
  PERMISSION_KEY,
  SUPER_ADMIN_KEY,
} from '../../../../../packages/plugin-host/src/require-permission.decorator';
import {
  PLUGIN_NAME_KEY,
  PLUGIN_REGISTRY,
  RBAC_SERVICE,
  type PluginRegistryLike,
  type RbacServiceLike,
} from '../../../../../packages/plugin-host/src/tokens';
import { validationExceptionFactory } from '../../core/errors/validation-exception-factory';

type DispatchContext = {
  body: unknown;
  query: Record<string, unknown>;
  params: Record<string, string>;
  headers: Record<string, unknown>;
  raw: FastifyRequest;
};

type RouteEntry = {
  pluginName: string;
  metatype: Type<unknown>;
  methodName: string;
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

const volumeValidationPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  exceptionFactory: validationExceptionFactory,
});

/** Fastify 5 forbids route() after listen — hot-loaded plugins register here instead. */
@Injectable()
export class InstancePluginHttpBridge {
  private readonly routes = new Map<string, RouteEntry>();
  private readonly container: NestContainer;
  private readonly scanner = new MetadataScanner();

  constructor(
    private readonly moduleRef: ModuleRef,
    @Optional() @Inject(RBAC_SERVICE) private readonly rbac?: RbacServiceLike,
  ) {
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
        const ctrlType = metatype as Type<unknown>;

        this.routes.set(key, {
          pluginName,
          metatype: ctrlType,
          methodName,
          handler: (ctx) => invokeControllerMethod(instance, ctrlType, methodName, ctx, this.rbac),
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
  rbac?: RbacServiceLike,
): Promise<unknown> {
  await assertPluginRouteAccess(metatype, methodName, ctx, rbac);

  const metadata =
    (Reflect.getMetadata(ROUTE_ARGS_METADATA, metatype, methodName) as
      Record<string, { index: number; data?: unknown; pipes?: unknown[] }> | undefined) ?? {};

  const paramTypes =
    (Reflect.getMetadata(PARAMTYPES_METADATA, metatype.prototype, methodName) as
      Type<unknown>[] | undefined) ?? [];

  const entries = Object.keys(metadata).map((key) => {
    const type = Number(key.split(':')[0]);
    const meta = metadata[key]!;
    return { type, index: meta.index, data: meta.data, pipes: meta.pipes ?? [] };
  });

  if (entries.length === 0) {
    return Promise.resolve(
      (instance as Record<string, (...args: unknown[]) => unknown>)[methodName].call(instance),
    );
  }

  const maxIndex = Math.max(...entries.map((e) => e.index));
  const args: unknown[] = new Array(maxIndex + 1).fill(undefined);
  for (const entry of entries) {
    args[entry.index] = await resolveRouteArgument(entry, ctx, paramTypes[entry.index]);
  }

  return Promise.resolve(
    (instance as Record<string, (...args: unknown[]) => unknown>)[methodName].call(
      instance,
      ...args,
    ),
  );
}

async function assertPluginRouteAccess(
  metatype: Type<unknown>,
  methodName: string,
  ctx: DispatchContext,
  rbac?: RbacServiceLike,
): Promise<void> {
  const handler = (metatype.prototype as Record<string, unknown>)[methodName] as object;
  const requireSuperAdmin =
    (Reflect.getMetadata(SUPER_ADMIN_KEY, handler) as boolean | undefined) ??
    (Reflect.getMetadata(SUPER_ADMIN_KEY, metatype) as boolean | undefined);
  const permission =
    (Reflect.getMetadata(PERMISSION_KEY, handler) as
      { resource: string; action: string } | undefined) ??
    (Reflect.getMetadata(PERMISSION_KEY, metatype) as
      { resource: string; action: string } | undefined);
  const permissionsAny =
    (Reflect.getMetadata(PERMISSION_ANY_KEY, handler) as
      Array<{ resource: string; action: string }> | undefined) ??
    (Reflect.getMetadata(PERMISSION_ANY_KEY, metatype) as
      Array<{ resource: string; action: string }> | undefined);

  if (!permission && !permissionsAny && !requireSuperAdmin) return;

  const userId = (ctx.raw as { session?: { userId?: string } } | undefined)?.session?.userId;
  if (!userId || !rbac) throw new ForbiddenException();

  if (requireSuperAdmin) {
    if (!(await rbac.isSuperAdmin(userId))) throw AppException.superAdminRequired();
  }

  if (permission) {
    if (!(await rbac.hasPermission(userId, permission.resource, permission.action))) {
      throw new ForbiddenException();
    }
    return;
  }

  if (permissionsAny && permissionsAny.length > 0) {
    for (const perm of permissionsAny) {
      if (await rbac.hasPermission(userId, perm.resource, perm.action)) return;
    }
    throw new ForbiddenException();
  }
}

async function resolveRouteArgument(
  entry: { type: number; index: number; data?: unknown; pipes: unknown[] },
  ctx: DispatchContext,
  metatype?: Type<unknown>,
): Promise<unknown> {
  let value: unknown;
  switch (entry.type) {
    case RouteParamtypes.BODY:
      value = ctx.body;
      break;
    case RouteParamtypes.QUERY:
      value = typeof entry.data === 'string' ? ctx.query[entry.data] : ctx.query;
      break;
    case RouteParamtypes.PARAM:
      value = typeof entry.data === 'string' ? ctx.params[entry.data] : ctx.params;
      break;
    case RouteParamtypes.HEADERS:
      value = typeof entry.data === 'string' ? ctx.headers[entry.data] : ctx.headers;
      break;
    case RouteParamtypes.REQUEST:
      value = ctx.raw;
      break;
    default:
      value = undefined;
  }

  if (entry.pipes.length > 0) {
    const metadata: ArgumentMetadata = {
      type: nestParamType(entry.type),
      metatype,
      data: typeof entry.data === 'string' ? entry.data : undefined,
    };
    for (const pipe of entry.pipes) {
      const instance = instantiatePipe(pipe);
      if (instance) value = await instance.transform(value, metadata);
    }
    return value;
  }

  if (
    (entry.type === RouteParamtypes.BODY || entry.type === RouteParamtypes.QUERY) &&
    isValidatableMetatype(metatype)
  ) {
    return volumeValidationPipe.transform(value, {
      type: entry.type === RouteParamtypes.BODY ? 'body' : 'query',
      metatype,
      data: typeof entry.data === 'string' ? entry.data : undefined,
    });
  }

  return value;
}

function nestParamType(type: number): ArgumentMetadata['type'] {
  switch (type) {
    case RouteParamtypes.BODY:
      return 'body';
    case RouteParamtypes.QUERY:
      return 'query';
    case RouteParamtypes.PARAM:
      return 'param';
    case RouteParamtypes.HEADERS:
      return 'custom';
    default:
      return 'custom';
  }
}

function instantiatePipe(pipe: unknown): PipeTransform | null {
  if (!pipe) return null;
  if (typeof pipe === 'function') {
    return new (pipe as new () => PipeTransform)();
  }
  if (typeof pipe === 'object' && pipe !== null && 'transform' in pipe) {
    return pipe as PipeTransform;
  }
  return null;
}

function isValidatableMetatype(metatype?: Type<unknown>): metatype is Type<unknown> {
  if (!metatype || typeof metatype !== 'function') return false;
  return !['String', 'Boolean', 'Number', 'Array', 'Object'].includes(metatype.name);
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
