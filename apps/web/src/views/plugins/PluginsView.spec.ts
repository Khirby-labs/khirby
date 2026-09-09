import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PluginsView from './PluginsView.vue';
import { server } from '../../test/msw/server';
import { api } from '../../test/api-base';
import { mountWithI18n } from '../../test/i18n';

/**
 * Boundary: Settings → Plugins shows Configure for non-empty configSchema
 * OR a custom panel in pluginSettingsPanels (ADR-0023).
 */

vi.mock('../../router', () => ({
  registerPluginRoutes: vi.fn(),
}));

const SwitchRootStub = {
  props: ['modelValue', 'disabled', 'ariaLabel'],
  emits: ['update:modelValue'],
  template: `<button type="button" :aria-label="ariaLabel" :disabled="disabled"
    @click="$emit('update:modelValue', !modelValue)"><slot /></button>`,
};
const SwitchThumbStub = { template: '<span />' };

function mountView(): VueWrapper {
  return mountWithI18n(PluginsView, {
    global: {
      plugins: [createPinia()],
      stubs: { SwitchRoot: SwitchRootStub, SwitchThumb: SwitchThumbStub },
    },
  });
}

const pluginsRoute = (list: unknown[]) =>
  http.get(api('/api/plugins'), () => HttpResponse.json(list));

afterEach(() => {
  vi.clearAllMocks();
});

describe('PluginsView — configure affordance', () => {
  beforeEach(() => {
    server.use(
      pluginsRoute([
        {
          id: '1',
          name: 'crm_webhook',
          displayName: 'Webhook',
          description: 'Sends events',
          version: '1.0.0',
          enabled: true,
          config: {},
          configSchema: [
            {
              key: 'WEBHOOK_URL',
              label: 'URL',
              type: 'url',
              required: true,
            },
          ],
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          frontendRoutes: [],
          canUninstall: false,
          codeLoaded: true,
        },
        {
          id: '2',
          name: 'crm_mcp',
          displayName: 'MCP Server',
          displayNameKey: 'plugins.mcp.displayName',
          description: 'MCP tools',
          version: '1.0.0',
          enabled: true,
          config: {},
          configSchema: [],
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          frontendRoutes: [],
          canUninstall: false,
          codeLoaded: true,
        },
        {
          id: '2b',
          name: 'crm_ai_compose',
          displayName: 'AI Compose',
          displayNameKey: 'plugins.aiCompose.displayName',
          description: 'AI drafts',
          version: '1.0.0',
          enabled: true,
          config: {},
          configSchema: [],
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          frontendRoutes: [],
          canUninstall: true,
          codeLoaded: true,
        },
        {
          id: '3',
          name: 'crm_discord',
          displayName: 'Discord',
          description: 'Notifications',
          version: '1.0.0',
          enabled: true,
          config: {},
          configSchema: [],
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          frontendRoutes: [],
          canUninstall: false,
          codeLoaded: true,
        },
        {
          id: '4',
          name: 'crm_hello_world',
          displayName: 'Hello World',
          description: null,
          version: '0.1.0',
          enabled: false,
          config: {},
          configSchema: [],
          installedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          frontendRoutes: [],
          canUninstall: true,
          codeLoaded: false,
        },
      ]),
    );
  });

  it('offers Configure for schema plugins and custom settings panels', async () => {
    const wrapper = mountView();
    await flushPromises();

    const configureButtons = wrapper.findAll('button').filter((b) => b.text() === 'Configure');
    // webhook (schema) + mcp + ai_compose (pluginSettingsPanels); not discord / hello
    expect(configureButtons).toHaveLength(3);
  });

  it('shows Uninstall for removable plugins', async () => {
    const wrapper = mountView();
    await flushPromises();

    const uninstallButtons = wrapper.findAll('button').filter((b) => b.text() === 'Uninstall');
    // crm_ai_compose + crm_hello_world
    expect(uninstallButtons).toHaveLength(2);
  });
});
