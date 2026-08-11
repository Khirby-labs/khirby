import { DynamicModule, Module } from '@nestjs/common';
import { CrmPlugin, CRM_PLUGINS } from '@khirby/plugin-sdk';
import { PLUGIN_REGISTRY, PluginEnabledGuard } from '../../../../../packages/plugin-host/src';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginsController } from './plugins.controller';
import { RbacModule } from '../../core/rbac/rbac.module';
import { PluginBridgeModule } from './plugin-bridge.module';

@Module({ imports: [RbacModule] })
export class PluginsModule {
  static forRoot(plugins: CrmPlugin[] = []): DynamicModule {
    const pluginNestModules = plugins.map((p) => p.getNestModule?.()).filter(Boolean);

    return {
      module: PluginsModule,
      global: true,
      imports: [PluginBridgeModule, ...pluginNestModules],
      controllers: [PluginsController],
      providers: [
        { provide: CRM_PLUGINS, useValue: plugins },
        PluginRegistryService,
        { provide: PLUGIN_REGISTRY, useExisting: PluginRegistryService },
        PluginEnabledGuard,
      ],
      exports: [PluginRegistryService, PLUGIN_REGISTRY, PluginEnabledGuard],
    };
  }
}
