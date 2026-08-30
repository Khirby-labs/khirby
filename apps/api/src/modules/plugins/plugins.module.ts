import { DynamicModule, Module } from '@nestjs/common';
import { CrmPlugin, CRM_PLUGINS } from '@khirby/plugin-sdk';
import {
  INSTANCE_PLUGINS,
  PLUGIN_REGISTRY,
  PluginEnabledGuard,
} from '../../../../../packages/plugin-host/src';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginNestHttpRegistrar } from './plugin-nest-http.registrar';
import { InstancePluginHttpBridge } from './instance-plugin-http.bridge';
import { InstancePluginHttpBridgeController } from './instance-plugin-http.controller';
import { PluginsController } from './plugins.controller';
import { RbacModule } from '../../core/rbac/rbac.module';
import { PluginBridgeModule } from './plugin-bridge.module';
import { loadImagePlugins } from './load-plugins';

@Module({ imports: [RbacModule] })
export class PluginsModule {
  static forRoot(plugins: CrmPlugin[] = []): DynamicModule {
    // Volume plugins must not become Fastify static routes: Fastify prefers a
    // concrete @Controller('plugins/hello-world-stats') over GET plugins/:segment,
    // so reloadFromDirectory would update the bridge while the SPA still hit the
    // boot controller. Image plugins stay imported; instance GET goes through
    // InstancePluginHttpBridge (ADR-0036).
    const imageNames = new Set(loadImagePlugins().map((plugin) => plugin.name));
    const pluginNestModules = plugins
      .filter((plugin) => imageNames.has(plugin.name))
      .map((plugin) => plugin.getNestModule?.())
      .filter(Boolean);

    return {
      module: PluginsModule,
      global: true,
      imports: [PluginBridgeModule, ...pluginNestModules],
      controllers: [PluginsController, InstancePluginHttpBridgeController],
      providers: [
        { provide: CRM_PLUGINS, useValue: plugins },
        PluginRegistryService,
        InstancePluginHttpBridge,
        PluginNestHttpRegistrar,
        { provide: PLUGIN_REGISTRY, useExisting: PluginRegistryService },
        { provide: INSTANCE_PLUGINS, useExisting: PluginRegistryService },
        PluginEnabledGuard,
      ],
      exports: [PluginRegistryService, PLUGIN_REGISTRY, INSTANCE_PLUGINS, PluginEnabledGuard],
    };
  }
}
