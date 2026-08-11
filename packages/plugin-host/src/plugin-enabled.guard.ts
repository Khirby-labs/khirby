import { Injectable, CanActivate, ExecutionContext, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from './app-exception';
import { PLUGIN_NAME_KEY, PLUGIN_REGISTRY, type PluginRegistryLike } from './tokens';

/**
 * Blocks HTTP when the plugin named by @RequirePluginEnabled is disabled or
 * missing from the in-memory registry context (ADR-0016).
 */
@Injectable()
export class PluginEnabledGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(PLUGIN_REGISTRY) private registry: PluginRegistryLike,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const pluginName = this.reflector.getAllAndOverride<string>(PLUGIN_NAME_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!pluginName) return true;

    if (typeof this.registry.isEnabled === 'function') {
      if (!this.registry.isEnabled(pluginName)) {
        throw AppException.pluginDisabled(pluginName);
      }
      return true;
    }

    const row = await this.registry.findByName(pluginName);
    if (!row?.enabled) {
      throw AppException.pluginDisabled(pluginName);
    }
    return true;
  }
}
