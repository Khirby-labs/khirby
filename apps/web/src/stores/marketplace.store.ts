import { defineStore } from './session-state';
import { computed, ref } from 'vue';
import type { MarketplaceCategory, MarketplacePlugin } from '@khirby/types';
import { ApiError, apiGet, apiPost } from '../api/client';
import { usePluginsStore } from './plugins.store';

/**
 * Why the catalog could not be shown — a CODE, never a sentence.
 *
 * A store that held the message would hold the server's English prose, and the
 * banner would render it untranslated on a Polish screen. Keeping the reason
 * machine-readable lets the view pick the message in the reader's language
 * (`.claude/rules/i18n.md`: throw a code, translate at render).
 */
export type MarketplaceError = 'forbidden' | 'load';

export const useMarketplaceStore = defineStore('marketplace', () => {
  const entries = ref<MarketplacePlugin[]>([]);
  const loading = ref(false);
  const error = ref<MarketplaceError | null>(null);
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
    error.value = null;
    try {
      entries.value = await apiGet<MarketplacePlugin[]>('/api/marketplace/plugins');
    } catch (e: unknown) {
      // Branch on the status, never on the message: a missing permission deserves
      // its own sentence naming what to ask for, and prose is translated.
      error.value = e instanceof ApiError && e.status === 403 ? 'forbidden' : 'load';
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
