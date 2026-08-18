import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import { mountWithI18n, withLocale, resetLocale } from '../../test/i18n';
import AppSidebar from './AppSidebar.vue';
import { usePluginsStore } from '../../stores/plugins.store';

/**
 * The first spec in components/shell/ — there was none, which is precisely why
 * "Marketplace sits between Workspace and Plugins" had no verifying artifact:
 * `nav.spec.ts` is a pure unit over the nav registry and cannot observe render
 * order, and the sections themselves are written out in this component.
 *
 * The assertion is on the ORDER of the rendered headings and links, because that
 * is the acceptance criterion. Anything that reads only "Marketplace appears
 * somewhere" would pass with the section in the wrong place.
 */

vi.mock('@vueuse/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vueuse/core')>()),
  // Desktop, expanded rail: the labels are what the order is read from.
  useMediaQuery: () => ({ value: true }),
}));

function makeRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/contacts', component: { template: '<div />' } },
      { path: '/marketplace', component: { template: '<div />' } },
      { path: '/plugins/listmonk', component: { template: '<div />' } },
    ],
  });
}

async function mountSidebar(plugins: unknown[] = []) {
  const pinia = createPinia();
  setActivePinia(pinia);

  const store = usePluginsStore();
  store.plugins = plugins as never;

  const router = makeRouter();
  await router.push('/contacts');
  await router.isReady();

  return mountWithI18n(AppSidebar, { global: { plugins: [pinia, router] } });
}

/** A plugin with its own sidebar route, so the Plugins group actually renders. */
const pluginWithRoute = {
  id: '1',
  name: 'crm_listmonk',
  displayName: 'Listmonk',
  description: null,
  version: '1.1.0',
  enabled: true,
  config: {},
  configSchema: [],
  installedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  frontendRoutes: [
    {
      path: '/plugins/listmonk',
      name: 'plugin-listmonk',
      navLabel: 'Newsletter',
      navIcon: 'plugins',
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  resetLocale();
  vi.clearAllMocks();
});

describe('AppSidebar — section order', () => {
  it('places Extensions between Workspace and Plugins', async () => {
    const wrapper = await mountSidebar([pluginWithRoute]);

    const headings = wrapper.findAll('nav p').map((p) => p.text());
    expect(headings).toEqual(['Workspace', 'Extensions', 'Plugins']);
  });

  it('puts the Marketplace link after the workspace links and before the plugin ones', async () => {
    const wrapper = await mountSidebar([pluginWithRoute]);

    const targets = wrapper.findAll('nav a').map((a) => a.attributes('href'));
    const contacts = targets.indexOf('/contacts');
    const marketplace = targets.indexOf('/marketplace');
    const plugin = targets.indexOf('/plugins/listmonk');

    expect(contacts).toBeGreaterThanOrEqual(0);
    expect(marketplace).toBeGreaterThan(contacts);
    expect(plugin).toBeGreaterThan(marketplace);
  });

  /*
   * The plugin group is conditional on there being plugin routes; the Extensions
   * section must not inherit that. On a fresh instance no plugin declares a
   * sidebar route, and Marketplace still has to be reachable — that is the state
   * in which an operator most needs it.
   */
  it('still shows Extensions when no plugin contributes a route', async () => {
    const wrapper = await mountSidebar([]);

    const headings = wrapper.findAll('nav p').map((p) => p.text());
    expect(headings).toEqual(['Workspace', 'Extensions']);
    expect(wrapper.findAll('nav a').map((a) => a.attributes('href'))).toContain('/marketplace');
  });

  it('labels the entry with resolved copy, never a message key', async () => {
    const wrapper = await mountSidebar([]);

    expect(wrapper.text()).toContain('Marketplace');
    expect(wrapper.text()).not.toContain('nav.extensions');
    expect(wrapper.text()).not.toContain('shell.sidebar');
  });

  it('renders the Polish section heading when Polish is active', async () => {
    await withLocale('pl');
    const wrapper = await mountSidebar([]);

    const headings = wrapper.findAll('nav p').map((p) => p.text());
    expect(headings).toContain('Rozszerzenia');
    expect(headings).not.toContain('Extensions');
  });

  it('gives Marketplace its own glyph rather than reusing the plugins one', async () => {
    const wrapper = await mountSidebar([pluginWithRoute]);

    const link = wrapper.findAll('nav a').find((a) => a.attributes('href') === '/marketplace');
    const pluginLink = wrapper
      .findAll('nav a')
      .find((a) => a.attributes('href') === '/plugins/listmonk');

    expect(link!.html()).not.toBe(pluginLink!.html());
    // The storefront path is unique to the marketplace glyph.
    expect(link!.html()).toContain('M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8');
  });
});
