import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setActivePinia, createPinia } from 'pinia';
import { router, registerPluginRoutes } from './index';
import { usePluginsStore, type Plugin } from '../stores/plugins.store';
import { server } from '../test/msw/server';
import { api } from '../test/api-base';

/**
 * Guard integration test. We drive the REAL exported router singleton (its
 * beforeEach guard, real auth/plugins stores, real api client) and mock only the
 * network boundary via MSW. Nothing here re-implements the guard — a regression
 * in the redirect logic or the dynamic plugin-route dance turns a test red.
 *
 * The 401→/login client redirect is intentionally NOT exercised here (it lives
 * in client.spec.ts); the "no session" case uses a network error so the guard's
 * own redirect is what we measure, with no client-side navigation side effect.
 */

const user = {
  id: 'u1',
  email: 'admin@example.com',
  locale: null,
  permissions: [],
  isSuperAdmin: false,
};

const listmonkPlugin = (enabled: boolean): Plugin => ({
  id: 'p1',
  name: 'crm_listmonk', // must match a key in pluginComponentMap
  displayName: 'Newsletter',
  description: null,
  version: '1.0.0',
  enabled,
  config: {},
  installedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  frontendRoutes: [
    { path: '/plugins/listmonk', name: 'listmonk', navLabel: 'Newsletter', navIcon: 'plugins' },
  ],
});

const authMe = (responder: () => Response) => http.get(api('/api/auth/me'), responder);
const plugins = (list: Plugin[]) => http.get(api('/api/plugins'), () => HttpResponse.json(list));

describe('router guard (beforeEach)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    // Purge any plugin routes added to the singleton so tests stay isolated.
    registerPluginRoutes([]);
  });

  it('redirects an unauthenticated visitor from a private route to login', async () => {
    server.use(authMe(() => HttpResponse.error())); // no session

    await router.push('/contacts');

    expect(router.currentRoute.value.name).toBe('login');
  });

  it('lets a public route through without a session', async () => {
    server.use(authMe(() => HttpResponse.error()));

    await router.push('/login');

    expect(router.currentRoute.value.name).toBe('login');
  });

  it('checks the session only once across multiple navigations', async () => {
    let meHits = 0;
    server.use(
      authMe(() => {
        meHits += 1;
        return HttpResponse.json(user);
      }),
      plugins([]),
    );

    await router.push('/login?a=1');
    await router.push('/login?a=2');

    expect(meHits).toBe(1);
  });

  it('registers an enabled plugin route and removes it once disabled', async () => {
    server.use(
      authMe(() => HttpResponse.json(user)),
      plugins([listmonkPlugin(true)]),
    );

    // First authenticated navigation triggers fetchPlugins + registration.
    await router.push('/login?x=1');
    expect(router.hasRoute('listmonk')).toBe(true);

    // Simulate the plugin being disabled, then navigate again.
    const store = usePluginsStore();
    store.plugins = [listmonkPlugin(false)];
    await router.push('/login?x=2');

    expect(router.hasRoute('listmonk')).toBe(false);
  });

  it('retries resolution for a direct plugin URL that starts as not-found', async () => {
    server.use(
      authMe(() => HttpResponse.json(user)),
      plugins([listmonkPlugin(true)]),
    );

    // The route does not exist yet, so the initial match is the catch-all.
    // The guard fetches plugins, registers the route, and re-resolves.
    await router.push('/plugins/listmonk');

    expect(router.currentRoute.value.name).toBe('listmonk');
    expect(router.currentRoute.value.fullPath).toBe('/plugins/listmonk');
  });

  it('registers a tab for an instance plugin that has no ./web bundle', async () => {
    const instancePlugin: Plugin = {
      id: 'p-hw',
      name: 'crm_hello_world',
      displayName: 'Hello World',
      description: null,
      version: '0.1.0',
      enabled: true,
      config: {},
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      frontendRoutes: [
        {
          path: '/plugins/hello-world',
          name: 'plugin-hello-world',
          navLabel: 'Hello World',
          navIcon: 'plugins',
        },
      ],
    };

    server.use(
      authMe(() => HttpResponse.json(user)),
      plugins([instancePlugin]),
    );

    await router.push('/plugins/hello-world');

    expect(router.hasRoute('plugin-hello-world')).toBe(true);
    expect(router.currentRoute.value.name).toBe('plugin-hello-world');
  });

  it('registers a route for an instance plugin with webBundleUrl', async () => {
    const hotWeb: Plugin = {
      id: 'p-hot',
      name: 'crm_hot_web',
      displayName: 'Hot Web',
      description: null,
      version: '0.1.0',
      enabled: true,
      config: {},
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      webBundleUrl: '/api/plugins/crm_hot_web/web/entry.js',
      webBundleVersion: '123',
      frontendRoutes: [
        {
          path: '/plugins/hot-web',
          name: 'plugin-hot-web',
          navLabel: 'Hot Web',
          navIcon: 'plugins',
        },
      ],
    };

    server.use(
      authMe(() => HttpResponse.json(user)),
      plugins([hotWeb]),
    );

    // Authenticated navigation registers routes; do not open the plugin URL
    // (that would dynamic-import the bundle, which MSW cannot serve as ESM).
    await router.push('/login?hot=1');

    expect(router.hasRoute('plugin-hot-web')).toBe(true);
  });

  it('replaces a volume plugin route when webBundleVersion changes', () => {
    const plugin = (version: string) => ({
      id: 'p-hot',
      name: 'crm_hot_web',
      displayName: 'Hot Web',
      description: null,
      version: '0.1.0',
      enabled: true,
      config: {},
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      webBundleUrl: '/api/plugins/crm_hot_web/web/entry.js',
      webBundleVersion: version,
      frontendRoutes: [
        {
          path: '/plugins/hot-web-bust',
          name: 'plugin-hot-web-bust',
          navLabel: 'Hot Web',
          navIcon: 'plugins',
        },
      ],
    });

    registerPluginRoutes([plugin('1')]);
    expect(router.hasRoute('plugin-hot-web-bust')).toBe(true);
    const remove = vi.spyOn(router, 'removeRoute');
    registerPluginRoutes([plugin('2')]);
    expect(remove).toHaveBeenCalledWith('plugin-hot-web-bust');
    expect(router.hasRoute('plugin-hot-web-bust')).toBe(true);
    remove.mockRestore();
  });
});
