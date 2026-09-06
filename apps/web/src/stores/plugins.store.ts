import { defineStore } from './session-state';
import { ref } from 'vue';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/client';
import { registerPluginRoutes } from '../router';
import type { Plugin, PluginConfigField, PluginFrontendRoute } from '@khirby/types';

// Re-exported so existing consumers keep importing these from the store.
export type { Plugin, PluginConfigField, PluginFrontendRoute };

export const usePluginsStore = defineStore('plugins', () => {
  const plugins = ref<Plugin[]>([]);
  const loading = ref(false);

  async function fetchPlugins(): Promise<void> {
    loading.value = true;
    try {
      plugins.value = await apiGet<Plugin[]>('/api/plugins');
      registerPluginRoutes(plugins.value);
    } finally {
      loading.value = false;
    }
  }

  async function togglePlugin(name: string, enabled: boolean): Promise<void> {
    const action = enabled ? 'enable' : 'disable';
    const updated = await apiPost<Plugin>(`/api/plugins/${name}/${action}`, {});
    const idx = plugins.value.findIndex((p) => p.name === name);
    if (idx !== -1) {
      plugins.value[idx] = { ...plugins.value[idx], ...updated };
    }
    registerPluginRoutes(plugins.value);
  }

  async function updateConfig(name: string, config: Record<string, string>): Promise<void> {
    const updated = await apiPatch<Plugin>(`/api/plugins/${name}/config`, config);
    const idx = plugins.value.findIndex((p) => p.name === name);
    if (idx !== -1) {
      plugins.value[idx] = { ...plugins.value[idx], ...updated };
    }
  }

  async function uninstallPlugin(name: string): Promise<void> {
    await apiDelete(`/api/plugins/installed/${name}`);
    plugins.value = plugins.value.filter((p) => p.name !== name);
    registerPluginRoutes(plugins.value);
  }

  return { plugins, loading, fetchPlugins, togglePlugin, updateConfig, uninstallPlugin };
});
