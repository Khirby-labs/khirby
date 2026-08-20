<script setup lang="ts">
/**
 * Host page for instance plugins that declare getFrontendRoutes() but have no
 * exports["./web"] (ADR-0036). Heading is the plugin displayName; optional
 * `stats` and `footer` come from GET /api{route.path} (plugin Nest controller).
 */
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { usePluginsStore } from '../../stores/plugins.store';
import { useServerText } from '../../composables/useServerText';
import { apiGet } from '../../api/client';
import SkeletonRows from '../../components/ui/SkeletonRows.vue';
import EmptyState from '../../components/ui/EmptyState.vue';

type PluginStat = { label: string; value: number };
type PluginPagePayload = {
  stats?: PluginStat[];
  footer?: string | null;
  footerText?: string | null;
  body?: string | null;
};

const route = useRoute();
const { t } = useI18n();
const store = usePluginsStore();
const { plugins, loading } = storeToRefs(store);
const { pluginDisplayName } = useServerText();

const plugin = computed(() =>
  plugins.value.find((p) => p.frontendRoutes?.some((r) => r.name === route.name)),
);

const stats = ref<PluginStat[] | null>(null);
const footer = ref<string | null>(null);
const statsLoading = ref(false);

watch(
  plugin,
  async (p) => {
    stats.value = null;
    footer.value = null;
    if (!p) return;
    const path = p.frontendRoutes?.find((r) => r.name === route.name)?.path;
    if (!path) return;
    statsLoading.value = true;
    try {
      const data = await apiGet<PluginPagePayload | null>(`/api${path}`);
      stats.value = data?.stats ?? null;
      const copy = data?.footer ?? data?.footerText ?? data?.body;
      footer.value = typeof copy === 'string' && copy.trim() ? copy.trim() : null;
    } catch {
      stats.value = null;
      footer.value = null;
    } finally {
      statsLoading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <SkeletonRows v-if="loading && !plugin" :rows="2" height="2.5rem" />
  <EmptyState v-else-if="!plugin" :title="t('errors.notFound.title')" />
  <div v-else class="space-y-6 p-6">
    <h1 class="crm-page-title">{{ pluginDisplayName(plugin) }}</h1>
    <SkeletonRows v-if="statsLoading" :rows="2" height="3rem" />
    <template v-else>
      <dl v-if="stats?.length" class="grid gap-4 sm:grid-cols-2">
        <div v-for="row in stats" :key="row.label" class="crm-panel px-5 py-4">
          <dt class="text-sm text-text-muted">{{ row.label }}</dt>
          <dd class="mt-1 text-2xl font-semibold tabular-nums text-text-primary">
            {{ row.value }}
          </dd>
        </div>
      </dl>
      <p v-if="footer" class="text-sm text-text-secondary">{{ footer }}</p>
    </template>
  </div>
</template>
