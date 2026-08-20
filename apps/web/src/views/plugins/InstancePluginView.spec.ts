import { describe, it, expect, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { http, HttpResponse } from 'msw';
import InstancePluginView from './InstancePluginView.vue';
import { usePluginsStore } from '../../stores/plugins.store';
import { mountWithI18n, resetLocale } from '../../test/i18n';
import { server } from '../../test/msw/server';
import { api } from '../../test/api-base';

async function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  usePluginsStore().plugins = [
    {
      id: '1',
      name: 'crm_hello_world_stats',
      displayName: 'Hello World',
      description: null,
      version: '0.1.0',
      enabled: true,
      config: {},
      configSchema: [],
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      frontendRoutes: [
        {
          path: '/plugins/hello-world-stats',
          name: 'plugin-hello-world-stats',
          navLabel: 'Hello World',
        },
      ],
    },
  ] as never;

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/plugins/hello-world-stats',
        name: 'plugin-hello-world-stats',
        component: InstancePluginView,
      },
    ],
  });
  await router.push('/plugins/hello-world-stats');
  await router.isReady();

  return mountWithI18n(InstancePluginView, { global: { plugins: [pinia, router] } });
}

afterEach(() => {
  resetLocale();
});

describe('InstancePluginView', () => {
  it('renders stats and footer copy from the plugin GET', async () => {
    server.use(
      http.get(api('/api/plugins/hello-world-stats'), () =>
        HttpResponse.json({
          stats: [{ label: 'Leads', value: 3 }],
          footerText: 'Testowy tekst na dole strony.',
        }),
      ),
    );

    const wrapper = await mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain('Hello World');
    expect(wrapper.text()).toContain('Leads');
    expect(wrapper.text()).toContain('3');
    expect(wrapper.text()).toContain('Testowy tekst na dole strony.');
  });
});
