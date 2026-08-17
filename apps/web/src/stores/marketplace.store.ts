import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { MarketplaceCategory, MarketplacePlugin } from '@khirby/types';
import { apiGet, apiPost } from '../api/client';
import { usePluginsStore } from './plugins.store';

export const useMarketplaceStore = defineStore('marketplace', () => {
  const entries = ref<MarketplacePlugin[]>([]);
  const loading = ref(false);
  const error = ref('');
  /** Name of the plugin currently being installed — one at a time, per card. */
  const installing = ref<string | null>(null);

  /** Categories actually present, so the filter never offers an empty bucket. */
  const categories = computed<MarketplaceCategory[]>(() => {
    const present = new Set(entries.value.map((entry) => entry.category));
    return [...present].sort();
  });

  const hasInstallable = computed(() => entries.value.some((e) => e.status === 'available'));

  async function fetchCatalog(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      entries.value = await apiGet<MarketplacePlugin[]>('/api/marketplace/plugins');
    } catch (e: unknown) {
      // The view needs to distinguish "no permission" from "nothing to show", so
      // the code travels with the message rather than the message being parsed.
      error.value = e instanceof Error ? e.message : 'Failed to load the catalog';
      entries.value = [];
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Install one plugin and fold the result back into the card.
   *
   * The plugin list is refetched afterwards because a plugin can contribute its
   * own sidebar route: `plugins.store` re-registers routes on fetch, so the new
   * entry appears without a page reload. Without this the operator would install
   * something and see no trace of it until they refreshed.
   */
  async function install(name: string): Promise<void> {
    installing.value = name;
    try {
      await apiPost(`/api/marketplace/plugins/${name}/install`, {});
      markInstalled(name);
      await usePluginsStore().fetchPlugins();
    } finally {
      installing.value = null;
    }
  }

  /**
   * Move a card to the installed state locally.
   *
   * Also used when a 409 comes back: that means another tab (or another click)
   * already installed it, so converging on "installed" is the truthful outcome —
   * leaving the card in an error state would misreport the system.
   */
  function markInstalled(name: string): void {
    const index = entries.value.findIndex((entry) => entry.name === name);
    if (index === -1) return;
    entries.value[index] = { ...entries.value[index], status: 'installed', enabled: true };
  }

  return {
    entries,
    loading,
    error,
    installing,
    categories,
    hasInstallable,
    fetchCatalog,
    install,
    markInstalled,
  };
});
