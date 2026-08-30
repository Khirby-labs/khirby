import { Injectable, Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { NestContainer } from '@nestjs/core/injector/container';
import { Module } from '@nestjs/core/injector/module';
import { InstancePluginHttpBridge } from './instance-plugin-http.bridge';

/**
 * Maps Nest controllers from instance plugins onto InstancePluginHttpBridge.
 * Fastify 5 cannot route() after listen; GET /api/plugins/:segment is the
 * boot-time dispatcher, and this registrar fills the bridge map.
 */
@Injectable()
export class PluginNestHttpRegistrar {
  private readonly container: NestContainer;
  private readonly registeredModuleTokens = new Set<string>();

  constructor(
    moduleRef: ModuleRef,
    private readonly instanceBridge: InstancePluginHttpBridge,
  ) {
    this.container = (moduleRef as unknown as { container: NestContainer }).container;
  }

  async registerModuleRoutes(
    moduleType: Type<unknown>,
    options?: { replace?: boolean; pluginName?: string },
  ): Promise<string[]> {
    const module = this.findLoadedModule(moduleType);
    if (!module) return [];
    if (options?.replace) {
      this.registeredModuleTokens.delete(module.token);
    }
    if (this.registeredModuleTokens.has(module.token)) {
      return [];
    }

    const paths = this.instanceBridge.registerModuleRoutes(moduleType, options?.pluginName);
    this.registeredModuleTokens.add(module.token);
    return paths;
  }

  /** LazyModuleLoader.load() must run before this — module is already in the container. */
  private findLoadedModule(moduleType: Type<unknown>): Module | undefined {
    for (const mod of this.container.getModules().values()) {
      if (mod.metatype === moduleType) return mod;
    }
    return undefined;
  }
}
