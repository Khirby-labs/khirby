import { Injectable, NotFoundException, Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModuleRef } from '@nestjs/core';
import { NestContainer } from '@nestjs/core/injector/container';
import { Module } from '@nestjs/core/injector/module';
import { MetadataScanner } from '@nestjs/core/metadata-scanner';
import { RequestMethod } from '@nestjs/common';
import { AppException } from '../../../../../packages/plugin-host/src/app-exception';
import {
  PLUGIN_NAME_KEY,
  PLUGIN_REGISTRY,
  type PluginRegistryLike,
} from '../../../../../packages/plugin-host/src/tokens';

type RouteEntry = {
  pluginName: string;
  handler: () => Promise<unknown>;
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

  /** Register GET handlers from a lazy-loaded Nest module (post-listen hotLoad). */
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
        if (method !== RequestMethod.GET) continue;

        const methodPath = Reflect.getMetadata(PATH_METADATA, handlerRef);
        const fullPath = joinRoutePath(controllerPath, methodPath);
        const key = routeKey('GET', fullPath);

        this.routes.set(key, {
          pluginName,
          handler: () => Promise.resolve(instance[methodName].call(instance)),
        });
        paths.push(`/api/${fullPath}`);
      }
    }
    return paths;
  }

  async dispatch(method: string, path: string): Promise<unknown> {
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

    return entry.handler();
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

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()}:${normalizePath(path)}`;
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+$/, '');
}

function joinRoutePath(controllerPath: string, methodPath: unknown): string {
  const ctrl = normalizePath(String(controllerPath ?? ''));
  const method =
    methodPath === undefined || methodPath === '/' ? '' : normalizePath(String(methodPath));
  if (!ctrl) return method;
  if (!method) return ctrl;
  return `${ctrl}/${method}`;
}
