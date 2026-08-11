import type { CrmPlugin, CrmEvent, PluginContext } from '@khirby/plugin-sdk';
import { Module, Controller, Get, UseGuards } from '@nestjs/common';
import {
  SessionGuard,
  PermissionGuard,
  RequirePermission,
  RequirePluginEnabled,
  PluginEnabledGuard,
} from '@khirby/plugin-host';

@Controller('plugins/hello')
@UseGuards(SessionGuard, PermissionGuard, PluginEnabledGuard)
@RequirePluginEnabled('crm_hello')
@RequirePermission('plugins', 'manage')
class HelloController {
  @Get()
  ping() {
    return { ok: true, plugin: 'crm_hello' };
  }
}

@Module({ controllers: [HelloController] })
class HelloNestModule {}

export class HelloPlugin implements CrmPlugin {
  name = 'crm_hello';
  displayName = 'Hello Example';
  description = 'Golden-path example plugin (events + Nest + Vue)';
  version = '1.0.0';

  getNestModule() {
    return HelloNestModule;
  }

  getFrontendRoutes() {
    return [
      {
        path: '/plugins/hello',
        name: 'plugin-hello',
        navLabel: 'Hello',
        navIcon: 'plugins',
        component: () => Promise.resolve(null),
      },
    ];
  }

  async onInit(ctx: PluginContext) {
    ctx.log('Hello plugin ready');
  }

  async onEvent(event: CrmEvent, ctx: PluginContext) {
    if (event.type === 'contact.created') {
      ctx.log('contact.created %s', event.payload.email);
    }
  }
}

export function createPlugin(): CrmPlugin {
  return new HelloPlugin();
}
