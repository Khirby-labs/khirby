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
  /** Name of the plugin currently being installed or updated — one at a time. */
  const installing = ref<string | null>(null);
  const updating = ref<string | null>(null);

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
   * Install key for Control Plane cards: prefer slug, fall back to crm_* name.
   * The API accepts either (MarketplaceService.install).
   */
  function installKey(entry: MarketplacePlugin): string {
    return entry.slug ?? entry.name;
  }

  /**
   * Install one plugin and fold the result back into the card.
   *
   * The plugin list is refetched afterwards because a plugin can contribute its
   * own sidebar route: `plugins.store` re-registers routes on fetch, so the new
   * entry appears without a page reload. Without this the operator would install
   * something and see no trace of it until they refreshed.
   */
  async function install(slugOrName: string): Promise<void> {
    installing.value = slugOrName;
    try {
      await apiPost(`/api/marketplace/plugins/${encodeURIComponent(slugOrName)}/install`, {});
      // Refetch so `version` / `latestVersion` / `updateAvailable` come from the
      // server — markInstalled alone would keep the pre-install catalog version.
      await fetchCatalog();
      await usePluginsStore().fetchPlugins();
    } finally {
      installing.value = null;
    }
  }

  async function update(slugOrName: string): Promise<void> {
    updating.value = slugOrName;
    try {
      await apiPost(`/api/marketplace/plugins/${encodeURIComponent(slugOrName)}/update`, {});
      await fetchCatalog();
      await usePluginsStore().fetchPlugins();
    } finally {
      updating.value = null;
    }
  }

  /**
   * Move a card to the installed state locally.
   *
   * Also used when a 409 comes back: that means another tab (or another click)
   * already installed it, so converging on "installed" is the truthful outcome —
   * leaving the card in an error state would misreport the system.
   */
  function markInstalled(slugOrName: string): void {
    const index = entries.value.findIndex(
      (entry) => entry.name === slugOrName || entry.slug === slugOrName,
    );
    if (index === -1) return;
    entries.value[index] = {
      ...entries.value[index],
      status: 'installed',
      enabled: true,
      updateAvailable: false,
    };
  }

  const submitting = ref(false);

  async function submit(body: {
    slug: string;
    name: string;
    packageName: string;
    description?: string;
    publisherName?: string;
    repositoryUrl?: string;
  }): Promise<void> {
    submitting.value = true;
    try {
      await apiPost('/api/marketplace/submissions', body);
    } finally {
      submitting.value = false;
    }
  }

  return {
    entries,
    loading,
    error,
    installing,
    updating,
    submitting,
    categories,
    hasInstallable,
    installKey,
    fetchCatalog,
    install,
    update,
    markInstalled,
    submit,
  };
});
