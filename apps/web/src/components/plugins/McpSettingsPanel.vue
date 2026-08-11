<template>
  <div class="space-y-5">
    <div class="flex items-start justify-between gap-3">
      <p class="text-sm text-text-muted">{{ t('plugins.mcp.subtitle') }}</p>
      <button
        type="button"
        class="btn-ghost px-3 py-1.5 text-sm disabled:opacity-50 shrink-0"
        :disabled="loading"
        @click="refresh"
      >
        {{ loading ? t('plugins.actions.refreshing') : t('plugins.actions.refresh') }}
      </button>
    </div>

    <div v-if="error" class="crm-error">{{ error }}</div>

    <section class="space-y-3">
      <h3 class="text-sm font-medium text-text-primary">{{ t('plugins.mcp.endpoint.title') }}</h3>
      <p class="text-sm text-text-muted">{{ t('plugins.mcp.endpoint.description') }}</p>
      <div class="flex flex-wrap items-center gap-2">
        <code
          class="flex-1 min-w-0 px-3 py-2 rounded-md border border-border bg-surface-input text-sm text-text-secondary font-mono break-all"
        >
          {{ endpointUrl }}
        </code>
        <button type="button" class="btn-ghost text-sm px-3 py-2" @click="copyText(endpointUrl)">
          {{ t('plugins.mcp.actions.copy') }}
        </button>
      </div>
    </section>

    <section class="space-y-4 border-t border-border pt-4">
      <div>
        <h3 class="text-sm font-medium text-text-primary">{{ t('plugins.mcp.token.title') }}</h3>
        <p class="text-sm text-text-muted mt-1">{{ t('plugins.mcp.token.description') }}</p>
      </div>

      <div v-if="status?.configured" class="space-y-1 text-sm">
        <p class="text-text-secondary">
          <span class="text-text-muted">{{ t('plugins.mcp.token.prefixLabel') }}</span>
          <code class="font-mono text-accent">{{ status.prefix }}</code>
        </p>
        <p v-if="status.createdAt" class="text-text-ghost text-xs">
          {{ t('plugins.mcp.token.createdAt', { date: formatDate(status.createdAt) }) }}
        </p>
      </div>
      <p v-else class="text-sm text-text-muted">{{ t('plugins.mcp.token.none') }}</p>

      <div
        v-if="revealedToken"
        class="rounded-md border border-warning/30 bg-warning/10 px-3 py-3 space-y-2"
      >
        <p class="text-sm text-warning">{{ t('plugins.mcp.token.revealedWarning') }}</p>
        <div class="flex flex-wrap items-center gap-2">
          <code
            class="flex-1 min-w-0 px-3 py-2 rounded-md border border-border bg-surface-input text-sm text-text-primary font-mono break-all"
          >
            {{ revealedToken }}
          </code>
          <button
            type="button"
            class="btn-ghost text-sm px-3 py-2"
            @click="copyText(revealedToken)"
          >
            {{ t('plugins.mcp.actions.copy') }}
          </button>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="btn-primary text-sm px-3 py-2 disabled:opacity-50"
          :disabled="busy"
          @click="rotate"
        >
          {{
            status?.configured ? t('plugins.mcp.actions.rotate') : t('plugins.mcp.actions.generate')
          }}
        </button>
        <button
          v-if="status?.configured"
          type="button"
          class="btn-ghost text-sm px-3 py-2 text-danger disabled:opacity-50"
          :disabled="busy"
          @click="revoke"
        >
          {{ t('plugins.mcp.actions.revoke') }}
        </button>
      </div>
    </section>

    <section class="space-y-4 border-t border-border pt-4">
      <div>
        <h3 class="text-sm font-medium text-text-primary">{{ t('plugins.mcp.connect.title') }}</h3>
        <p class="text-sm text-text-muted mt-1">{{ t('plugins.mcp.connect.description') }}</p>
      </div>

      <div class="space-y-3">
        <div>
          <p class="text-xs font-medium text-text-ghost uppercase tracking-wider mb-1.5">
            {{ t('plugins.mcp.connect.claude') }}
          </p>
          <pre
            class="px-3 py-2 rounded-md border border-border bg-surface-input text-xs text-text-secondary font-mono overflow-x-auto whitespace-pre-wrap"
            >{{ claudeSnippet }}</pre>
        </div>
        <div>
          <p class="text-xs font-medium text-text-ghost uppercase tracking-wider mb-1.5">
            {{ t('plugins.mcp.connect.cursor') }}
          </p>
          <pre
            class="px-3 py-2 rounded-md border border-border bg-surface-input text-xs text-text-secondary font-mono overflow-x-auto whitespace-pre-wrap"
            >{{ cursorSnippet }}</pre>
        </div>
        <div>
          <p class="text-xs font-medium text-text-ghost uppercase tracking-wider mb-1.5">
            {{ t('plugins.mcp.connect.generic') }}
          </p>
          <pre
            class="px-3 py-2 rounded-md border border-border bg-surface-input text-xs text-text-secondary font-mono overflow-x-auto whitespace-pre-wrap"
            >{{ genericSnippet }}</pre>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGet, apiPost, apiDelete } from '../../api/client';
import { useConfirm } from '../../composables/useConfirm';

interface TokenStatus {
  configured: boolean;
  prefix?: string;
  createdAt?: string;
  lastUsedAt?: string | null;
}

const { t, d } = useI18n();
const askConfirm = useConfirm();

const loading = ref(false);
const busy = ref(false);
const error = ref('');
const status = ref<TokenStatus | null>(null);
const revealedToken = ref('');

const endpointUrl = computed(() => {
  if (typeof window === 'undefined') return '/api/mcp';
  return `${window.location.origin}/api/mcp`;
});

const tokenPlaceholder = computed(
  () => revealedToken.value || status.value?.prefix || 'brly_mcp_…',
);

const claudeSnippet = computed(
  () =>
    `claude mcp add --transport http bearly-crm ${endpointUrl.value} \\\n  --header "Authorization: Bearer ${tokenPlaceholder.value}"`,
);

const cursorSnippet = computed(() =>
  JSON.stringify(
    {
      mcpServers: {
        'bearly-crm': {
          type: 'http',
          url: endpointUrl.value,
          headers: {
            Authorization: `Bearer ${tokenPlaceholder.value}`,
          },
        },
      },
    },
    null,
    2,
  ),
);

const genericSnippet = computed(
  () =>
    `POST ${endpointUrl.value}\nAuthorization: Bearer ${tokenPlaceholder.value}\nContent-Type: application/json\nAccept: application/json, text/event-stream`,
);

function formatDate(iso: string): string {
  try {
    return d(new Date(iso), 'dateShort');
  } catch {
    return iso;
  }
}

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    status.value = await apiGet<TokenStatus>('/api/plugins/mcp/token');
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('plugins.mcp.errors.load');
    status.value = null;
  } finally {
    loading.value = false;
  }
}

async function rotate() {
  busy.value = true;
  error.value = '';
  try {
    const res = await apiPost<{ token: string }>('/api/plugins/mcp/token/rotate', {});
    revealedToken.value = res.token;
    await refresh();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('plugins.mcp.errors.rotate');
  } finally {
    busy.value = false;
  }
}

async function revoke() {
  const ok = await askConfirm({
    title: t('plugins.mcp.token.revokeTitle'),
    message: t('plugins.mcp.token.revokeConfirm'),
    confirmLabel: t('plugins.mcp.actions.revoke'),
    danger: true,
  });
  if (!ok) return;
  busy.value = true;
  error.value = '';
  try {
    await apiDelete('/api/plugins/mcp/token');
    revealedToken.value = '';
    await refresh();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('plugins.mcp.errors.revoke');
  } finally {
    busy.value = false;
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

onMounted(refresh);
</script>
