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
// `integrations`, not `plugins`: there is no `plugins` resource in the permission
// catalog, so the old declaration made this route unreachable for everyone — a
// super-admin included. This is the resource the core plugins controller uses.
@RequirePermission('integrations', 'manage')
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
  /*
   * Literal + key, the same pair the six first-party plugins ship (ADR-0011). The
   * literal is what the database stores and what an SPA that has never heard of
   * this plugin falls back to; the key is what makes the Marketplace card read in
   * Polish. Without the keys this would be the one card on the page stuck in
   * English.
   */
  displayName = 'Hello Example';
  displayNameKey = 'plugins.hello.displayName';
  description = 'Golden-path example plugin (events + Nest + Vue)';
  descriptionKey = 'plugins.hello.description';
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
        // Kept out of the sidebar and ⌘K: `navLabel` is an English literal, and
        // the app ships pl + en, so surfacing it would put an untranslated string
        // into the chrome (ADR-0011). The route itself still works.
        showInNav: false,
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
