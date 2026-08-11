import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PluginsView from './PluginsView.vue';
import { server } from '../../test/msw/server';
import { api } from '../../test/api-base';
import { mountWithI18n } from '../../test/i18n';

/**
 * Boundary: Settings → Plugins shows Konfiguruj for schema plugins AND for
 * first-party custom settings panels (ADR-0023) — not only when configSchema
 * is non-empty.
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

describe('PluginsView — configure affordance (ADR-0023)', () => {
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
        },
      ]),
      http.get(api('/api/plugins/mcp/token'), () => HttpResponse.json({ configured: false })),
    );
  });

  it('offers Configure for schema plugins and for MCP (custom panel), not for ops-only plugins', async () => {
    const wrapper = mountView();
    await flushPromises();

    const configureButtons = wrapper.findAll('button').filter((b) => b.text() === 'Configure');
    expect(configureButtons).toHaveLength(2);
  });

  it('expands the MCP settings panel inline instead of navigating away', async () => {
    const wrapper = mountView();
    await flushPromises();

    const configureButtons = wrapper.findAll('button').filter((b) => b.text() === 'Configure');
    await configureButtons[1]!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Endpoint');
    expect(wrapper.text()).toContain('/api/mcp');
  });
});
