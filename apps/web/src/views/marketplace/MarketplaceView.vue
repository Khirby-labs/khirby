<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 class="crm-page-title">{{ t('marketplace.title') }}</h2>
        <p class="mt-1 text-sm text-text-muted">{{ t('marketplace.subtitle') }}</p>
      </div>

      <div class="flex flex-wrap items-end gap-3">
        <button type="button" class="btn-ghost px-3 py-1.5 text-sm" @click="showSubmit = true">
          {{ t('marketplace.submit.open') }}
        </button>
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

      <section v-for="section in catalogSections" :key="section.id" class="space-y-3">
        <h3 class="text-sm font-medium text-text-secondary">
          {{
            section.id === 'verified'
              ? t('marketplace.section.verified')
              : t('marketplace.section.community')
          }}
        </h3>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <article
            v-for="entry in section.entries"
            :key="cardKey(entry)"
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
                  <span class="font-mono">{{ versionLabel(entry) }}</span>
                  <span
                    v-if="entry.updateAvailable && entry.latestVersion"
                    class="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-warning"
                  >
                    {{ t('marketplace.card.updateAvailable', { version: entry.latestVersion }) }}
                  </span>
                  <span v-if="publisherOf(entry)">· {{ publisherOf(entry) }}</span>
                  <span>· {{ t(categoryKey(entry.category)) }}</span>
                  <span
                    v-if="entry.compatible === false"
                    class="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-warning"
                  >
                    {{ t('marketplace.card.incompatible') }}
                  </span>
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
                    store.installing === store.installKey(entry)
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
                <button
                  v-if="entry.updateAvailable"
                  type="button"
                  class="btn-primary px-3 py-1.5 text-sm"
                  :disabled="store.installing !== null || store.updating !== null"
                  @click="handleUpdate(entry)"
                >
                  {{
                    store.updating === store.installKey(entry)
                      ? t('marketplace.card.updating')
                      : t('marketplace.card.update')
                  }}
                </button>
                <RouterLink to="/settings/integrations" class="btn-ghost px-3 py-1.5 text-sm">
                  {{ t('marketplace.card.configure') }}
                </RouterLink>
              </template>
            </div>
          </article>
        </div>
      </section>
    </template>

    <AppModal v-if="selected" :title="pluginDisplayName(selected)" @close="selected = null">
      <div class="space-y-4">
        <p class="flex flex-wrap items-center gap-x-2 text-xs text-text-ghost">
          <span class="font-mono">{{ versionLabel(selected) }}</span>
          <span
            v-if="selected.updateAvailable && selected.latestVersion"
            class="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-warning"
          >
            {{ t('marketplace.card.updateAvailable', { version: selected.latestVersion }) }}
          </span>
          <span v-if="publisherOf(selected)">· {{ publisherOf(selected) }}</span>
          <span>· {{ t(categoryKey(selected.category)) }}</span>
          <span
            v-if="selected.compatible === false"
            class="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-warning"
          >
            {{ t('marketplace.card.incompatible') }}
          </span>
        </p>

        <p v-if="selected.description" class="text-sm text-text-secondary">
          {{ pluginDescription(selected) }}
        </p>

        <div v-if="(selected.permissions ?? []).length">
          <h4 class="text-sm font-semibold text-text-primary">
            {{ t('marketplace.details.permissions') }}
          </h4>
          <ul class="mt-2 space-y-1">
            <li
              v-for="perm in selected.permissions"
              :key="perm"
              class="font-mono text-xs text-text-muted"
            >
              {{ perm }}
            </li>
          </ul>
        </div>

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

    <AppModal v-if="showSubmit" :title="t('marketplace.submit.title')" @close="showSubmit = false">
      <form class="space-y-3" @submit.prevent="handleSubmit">
        <p class="text-sm text-text-muted">{{ t('marketplace.submit.subtitle') }}</p>
        <div>
          <label class="crm-label" for="mp-submit-slug">{{ t('marketplace.submit.slug') }}</label>
          <input
            id="mp-submit-slug"
            v-model="submitForm.slug"
            class="crm-input mt-1 w-full"
            required
            autocomplete="off"
          />
        </div>
        <div>
          <label class="crm-label" for="mp-submit-name">{{ t('marketplace.submit.name') }}</label>
          <input
            id="mp-submit-name"
            v-model="submitForm.name"
            class="crm-input mt-1 w-full"
            required
            autocomplete="off"
          />
        </div>
        <div>
          <label class="crm-label" for="mp-submit-package">{{
            t('marketplace.submit.packageName')
          }}</label>
          <input
            id="mp-submit-package"
            v-model="submitForm.packageName"
            class="crm-input mt-1 w-full font-mono text-sm"
            required
            autocomplete="off"
          />
        </div>
        <div>
          <label class="crm-label" for="mp-submit-desc">{{
            t('marketplace.submit.description')
          }}</label>
          <textarea
            id="mp-submit-desc"
            v-model="submitForm.description"
            class="crm-input mt-1 w-full"
            rows="3"
          />
        </div>
        <div>
          <label class="crm-label" for="mp-submit-publisher">{{
            t('marketplace.submit.publisherName')
          }}</label>
          <input
            id="mp-submit-publisher"
            v-model="submitForm.publisherName"
            class="crm-input mt-1 w-full"
            autocomplete="off"
          />
        </div>
        <div>
          <label class="crm-label" for="mp-submit-repo">{{
            t('marketplace.submit.repositoryUrl')
          }}</label>
          <input
            id="mp-submit-repo"
            v-model="submitForm.repositoryUrl"
            class="crm-input mt-1 w-full font-mono text-sm"
            type="url"
            autocomplete="off"
          />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-ghost px-3 py-1.5 text-sm" @click="showSubmit = false">
            {{ t('common.actions.cancel') }}
          </button>
          <button
            type="submit"
            class="btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
            :disabled="store.submitting"
          >
            {{
              store.submitting ? t('marketplace.submit.submitting') : t('marketplace.submit.submit')
            }}
          </button>
        </div>
      </form>
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
const showSubmit = ref(false);
const submitForm = ref({
  slug: '',
  name: '',
  packageName: '',
  description: '',
  publisherName: '',
  repositoryUrl: '',
});

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

function publisherOf(entry: MarketplacePlugin): string | null {
  return entry.publisherName ?? entry.vendor ?? null;
}

function cardKey(entry: MarketplacePlugin): string {
  return entry.slug ?? entry.name;
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

/**
 * Verified Control Plane listings above community. Title keys are literals so
 * i18n-guard can see them; sections with no cards are omitted.
 */
const catalogSections = computed(() => {
  const verified = visibleEntries.value.filter((entry) => entry.verified === true);
  const community = visibleEntries.value.filter((entry) => entry.verified !== true);
  const sections: { id: 'verified' | 'community'; entries: MarketplacePlugin[] }[] = [];
  if (verified.length) {
    sections.push({ id: 'verified', entries: verified });
  }
  if (community.length) {
    sections.push({ id: 'community', entries: community });
  }
  return sections;
});

/** The backend may name a glyph this build does not know — fall back, never blank. */
function iconOf(entry: MarketplacePlugin): NavIconName {
  return isNavIconName(entry.icon) ? entry.icon : 'plugins';
}

/** Installed cards show the row version; available cards show the catalog latest. */
function versionLabel(entry: MarketplacePlugin): string {
  return `v${entry.version}`;
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
  const key = store.installKey(entry);
  try {
    await store.install(key);
    toast.success(t('marketplace.toast.installed', { name: pluginDisplayName(entry) }));
  } catch (e: unknown) {
    // Branch on the code, never the message — prose is translated (ADR-0011).
    if (e instanceof ApiError && e.status === 409) {
      // Someone else already installed it; converge on the truth rather than
      // leaving the card stuck showing an install button that cannot work.
      store.markInstalled(key);
      await store.fetchCatalog();
      toast.error(t('marketplace.toast.alreadyInstalled'));
      return;
    }
    if (
      e instanceof ApiError &&
      (e.params?.code === 'web_bundle_required' || e.message.includes('dist/web'))
    ) {
      toast.error(t('marketplace.toast.webBundleRequired'));
      return;
    }
    toast.error(t('marketplace.toast.installFailed'));
  }
}

async function handleUpdate(entry: MarketplacePlugin): Promise<void> {
  const key = store.installKey(entry);
  try {
    await store.update(key);
    toast.success(
      t('marketplace.toast.updated', {
        name: pluginDisplayName(entry),
        version: entry.latestVersion ?? entry.version,
      }),
    );
  } catch (e: unknown) {
    if (
      e instanceof ApiError &&
      (e.params?.code === 'web_bundle_required' || e.message.includes('dist/web'))
    ) {
      toast.error(t('marketplace.toast.webBundleRequired'));
      return;
    }
    toast.error(t('marketplace.toast.updateFailed'));
  }
}

async function handleSubmit(): Promise<void> {
  const body = {
    slug: submitForm.value.slug.trim(),
    name: submitForm.value.name.trim(),
    packageName: submitForm.value.packageName.trim(),
    description: submitForm.value.description.trim() || undefined,
    publisherName: submitForm.value.publisherName.trim() || undefined,
    repositoryUrl: submitForm.value.repositoryUrl.trim() || undefined,
  };
  try {
    await store.submit(body);
    toast.success(t('marketplace.toast.submitted'));
    showSubmit.value = false;
    submitForm.value = {
      slug: '',
      name: '',
      packageName: '',
      description: '',
      publisherName: '',
      repositoryUrl: '',
    };
  } catch {
    toast.error(t('marketplace.toast.submitFailed'));
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
