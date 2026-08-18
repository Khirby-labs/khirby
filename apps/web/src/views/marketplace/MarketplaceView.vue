<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 class="crm-page-title">{{ t('marketplace.title') }}</h2>
        <p class="mt-1 text-sm text-text-muted">{{ t('marketplace.subtitle') }}</p>
      </div>

      <div v-if="!store.loading && !store.error && store.entries.length">
        <span class="crm-label">{{ t('marketplace.filter.label') }}</span>
        <AppSelect
          v-model="category"
          :options="categoryOptions"
          :aria-label="t('marketplace.filter.label')"
          trigger-class="min-w-[12rem]"
        />
      </div>
    </div>

    <div v-if="store.error" class="crm-error">{{ errorMessage }}</div>

    <SkeletonRows v-else-if="store.loading" :rows="3" height="8rem" />

    <!-- Nothing in the catalog at all. Distinct from "everything is installed",
         which is a full grid and the default state of a fresh instance. -->
    <EmptyState
      v-else-if="!store.entries.length"
      :title="t('marketplace.empty.title')"
      :message="t('marketplace.empty.message')"
    >
      <template #icon><NavIcon name="marketplace" /></template>
    </EmptyState>

    <template v-else>
      <p v-if="!store.hasInstallable" class="text-sm text-text-muted">
        {{ t('marketplace.allInstalled') }}
      </p>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <article
          v-for="entry in visibleEntries"
          :key="entry.name"
          class="crm-panel flex flex-col gap-3 p-5 text-left"
        >
          <div class="flex items-start gap-3">
            <span
              class="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-surface-raise text-text-muted"
              aria-hidden="true"
            >
              <NavIcon :name="iconOf(entry)" />
            </span>
            <div class="min-w-0 flex-1">
              <!-- min-w-0 + break-words: a long plugin name must wrap inside the
                   card instead of widening the grid track and scrolling the page. -->
              <h3 class="break-words text-base font-semibold text-text-primary">
                {{ pluginDisplayName(entry) }}
              </h3>
              <p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-text-ghost">
                <span class="font-mono">v{{ entry.version }}</span>
                <span v-if="entry.vendor">· {{ entry.vendor }}</span>
                <span>· {{ t(categoryKey(entry.category)) }}</span>
              </p>
            </div>
          </div>

          <p
            v-if="entry.description"
            class="line-clamp-3 flex-1 break-words text-sm text-text-muted"
          >
            {{ pluginDescription(entry) }}
          </p>
          <div v-else class="flex-1" />

          <div class="flex flex-wrap items-center gap-2">
            <button class="btn-ghost px-3 py-1.5 text-sm" @click="selected = entry">
              {{ t('marketplace.card.details') }}
            </button>

            <template v-if="entry.status === 'available'">
              <button
                class="btn-primary px-3 py-1.5 text-sm"
                :disabled="store.installing !== null"
                @click="handleInstall(entry)"
              >
                {{
                  store.installing === entry.name
                    ? t('marketplace.card.installing')
                    : t('marketplace.card.install')
                }}
              </button>
            </template>

            <template v-else>
              <!-- Installed: configuration lives in Settings (ADR-0023), so the card
                   links there rather than repeating the form. A disabled plugin is
                   still installed — offering "install" again would be a lie. -->
              <span
                class="inline-flex items-center gap-1.5 text-xs"
                :class="entry.enabled ? 'text-success' : 'text-text-ghost'"
              >
                <span
                  class="h-1.5 w-1.5 rounded-full"
                  :class="entry.enabled ? 'bg-success' : 'bg-text-ghost'"
                  aria-hidden="true"
                />
                {{
                  entry.enabled ? t('marketplace.card.installed') : t('marketplace.card.disabled')
                }}
              </span>
              <RouterLink to="/settings/integrations" class="btn-ghost px-3 py-1.5 text-sm">
                {{ t('marketplace.card.configure') }}
              </RouterLink>
            </template>
          </div>
        </article>
      </div>
    </template>

    <AppModal v-if="selected" :title="pluginDisplayName(selected)" @close="selected = null">
      <div class="space-y-4">
        <p class="flex flex-wrap items-center gap-x-2 text-xs text-text-ghost">
          <span class="font-mono">v{{ selected.version }}</span>
          <span v-if="selected.vendor">· {{ selected.vendor }}</span>
          <span>· {{ t(categoryKey(selected.category)) }}</span>
        </p>

        <p v-if="selected.description" class="text-sm text-text-secondary">
          {{ pluginDescription(selected) }}
        </p>

        <div v-if="requiredKeys(selected).length">
          <h4 class="text-sm font-semibold text-text-primary">
            {{ t('marketplace.details.requiredConfig') }}
          </h4>
          <p class="mt-1 text-xs text-text-ghost">
            {{
              t(
                'marketplace.details.requiredCount',
                { count: requiredKeys(selected).length },
                requiredKeys(selected).length,
              )
            }}
          </p>
          <ul class="mt-2 space-y-1">
            <li
              v-for="field in requiredKeys(selected)"
              :key="field.key"
              class="font-mono text-xs text-text-muted"
            >
              {{ field.key }}
            </li>
          </ul>
          <p class="mt-2 text-xs text-text-ghost">{{ t('marketplace.details.configureAfter') }}</p>
        </div>

        <a
          v-if="selected.docsUrl"
          :href="selected.docsUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-block text-sm text-accent hover:underline"
        >
          {{ t('marketplace.details.docs') }}
        </a>
      </div>
    </AppModal>
  </div>
</template>

<script setup lang="ts">
/**
 * Marketplace — the catalog page (ADR-0033). Discovery and installation only:
 * once a plugin is installed the card hands off to Settings → Plugins, which owns
 * configuration (ADR-0023).
 */
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { MarketplaceCategory, MarketplacePlugin, PluginConfigField } from '@khirby/types';
import { useMarketplaceStore, type MarketplaceError } from '../../stores/marketplace.store';
import { useToastStore } from '../../stores/toast.store';
import { useServerText } from '../../composables/useServerText';
import { isNavIconName, type NavIconName } from '../../components/nav-icons';
import AppModal from '../../components/AppModal.vue';
import AppSelect from '../../components/ui/AppSelect.vue';
import EmptyState from '../../components/ui/EmptyState.vue';
import NavIcon from '../../components/NavIcon.vue';
import SkeletonRows from '../../components/ui/SkeletonRows.vue';
import { ApiError } from '../../api/client';

const { t } = useI18n();
const store = useMarketplaceStore();
const toast = useToastStore();
const { pluginDisplayName, pluginDescription } = useServerText();

/**
 * Reka's SelectItem forbids an empty value, and an option carrying one crashes the
 * view on mount — green typecheck, green tests, blank page (INCIDENTS 2026-07-24).
 */
const ALL_CATEGORIES = '__all__';

const category = ref<string>(ALL_CATEGORIES);
const selected = ref<MarketplacePlugin | null>(null);

/**
 * Category token → message key by explicit lookup, never `'marketplace.category.' + token`.
 * `i18n-guard` only matches literal keys, so a concatenated one passes the gate and
 * ships a raw token to the screen.
 */
const CATEGORY_KEYS: Record<MarketplaceCategory, string> = {
  communication: 'marketplace.category.communication',
  marketing: 'marketplace.category.marketing',
  automation: 'marketplace.category.automation',
  ai: 'marketplace.category.ai',
  integration: 'marketplace.category.integration',
  other: 'marketplace.category.other',
};

function categoryKey(value: MarketplaceCategory): string {
  return CATEGORY_KEYS[value] ?? CATEGORY_KEYS.other;
}

const categoryOptions = computed(() => [
  { value: ALL_CATEGORIES, label: t('marketplace.filter.all') },
  ...store.categories.map((value) => ({ value, label: t(categoryKey(value)) })),
]);

const visibleEntries = computed(() =>
  category.value === ALL_CATEGORIES
    ? store.entries
    : store.entries.filter((entry) => entry.category === category.value),
);

/** The backend may name a glyph this build does not know — fall back, never blank. */
function iconOf(entry: MarketplacePlugin): NavIconName {
  return isNavIconName(entry.icon) ? entry.icon : 'plugins';
}

function requiredKeys(entry: MarketplacePlugin): PluginConfigField[] {
  return (entry.configSchema ?? []).filter((field) => field.required);
}

/**
 * Reason code → message key, resolved at render so the banner follows the active
 * language. A literal map for the same reason the categories use one: i18n-guard
 * matches only literal `t()` keys.
 */
const ERROR_KEYS: Record<MarketplaceError, string> = {
  forbidden: 'marketplace.errors.forbidden',
  load: 'marketplace.errors.load',
};

const errorMessage = computed(() => (store.error ? t(ERROR_KEYS[store.error]) : ''));

async function handleInstall(entry: MarketplacePlugin): Promise<void> {
  try {
    await store.install(entry.name);
    toast.success(t('marketplace.toast.installed', { name: pluginDisplayName(entry) }));
  } catch (e: unknown) {
    // Branch on the code, never the message — prose is translated (ADR-0011).
    if (e instanceof ApiError && e.status === 409) {
      // Someone else already installed it; converge on the truth rather than
      // leaving the card stuck showing an install button that cannot work.
      store.markInstalled(entry.name);
      toast.error(t('marketplace.toast.alreadyInstalled'));
      return;
    }
    toast.error(t('marketplace.toast.installFailed'));
  }
}

onMounted(async () => {
  try {
    await store.fetchCatalog();
  } catch {
    // The banner renders from store.error; a rejected promise here is expected.
  }
});
</script>
