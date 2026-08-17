import type { CrmPlugin, CrmEvent, PluginContext } from '@khirby/plugin-sdk';
import { Module, Controller, Get, UseGuards } from '@nestjs/common';
/*
 * Relative, NOT '@khirby/plugin-host' — the same path the first-party plugins use.
 *
 * This is a VALUE import, so tsc emits a real `require()` with whatever specifier
 * is written here. `nest build` is plain tsc and rewrites nothing, and the runtime
 * image ships only the build output plus each package's package.json — so a bare
 * specifier resolves to a directory with no sources and the API dies at boot with
 * MODULE_NOT_FOUND. Nothing catches that earlier: typecheck, lint and the whole
 * test suite pass, and even `docker build` succeeds.
 *
 * A plugin published to npm and installed by an operator DOES import the bare
 * specifier (see docs/PLUGINS.md) — that works because npm gives it a real
 * node_modules entry. This fixture is different: it is compiled into apps/api's
 * own output, so it follows the first-party convention.
 */
import {
  SessionGuard,
  PermissionGuard,
  RequirePermission,
  RequirePluginEnabled,
  PluginEnabledGuard,
} from '../../../packages/plugin-host/src';

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
