<template>
  <div class="crm-panel p-5 space-y-3">
    <h3 class="text-sm font-medium text-text-secondary">{{ t('settings.version.title') }}</h3>

    <div v-if="loading" class="text-sm text-text-ghost">{{ t('settings.version.checking') }}</div>

    <template v-else-if="info">
      <dl class="space-y-2 text-sm">
        <div class="flex items-baseline justify-between gap-3">
          <dt class="text-text-muted">{{ t('settings.version.running') }}</dt>
          <dd class="font-mono text-text-primary">{{ displayCurrent }}</dd>
        </div>
        <div v-if="info.latest" class="flex items-baseline justify-between gap-3">
          <dt class="text-text-muted">{{ t('settings.version.latest') }}</dt>
          <dd class="font-mono text-text-primary">{{ info.latest }}</dd>
        </div>
      </dl>

      <p
        v-if="info.updateAvailable"
        class="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-text-primary"
      >
        {{ t('settings.version.updateAvailable') }}
      </p>
      <p v-else-if="isDevBuild" class="text-xs text-text-ghost">
        {{ t('settings.version.devHint') }}
      </p>
      <p v-else-if="info.checkFailed" class="text-xs text-text-ghost">
        {{ t('settings.version.checkFailed') }}
      </p>
      <p v-else-if="info.latest" class="text-xs text-text-ghost">
        {{ t('settings.version.upToDate') }}
      </p>

      <a
        v-if="info.releaseUrl && info.updateAvailable"
        :href="info.releaseUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex text-xs font-medium text-accent hover:underline"
      >
        {{ t('settings.version.releaseLink') }}
      </a>
    </template>

    <p v-else class="text-xs text-text-ghost">{{ t('settings.version.checkFailed') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppVersionInfo } from '@khirby/types';
import { apiGet } from '../../api/client';

const { t } = useI18n();

const loading = ref(true);
const info = ref<AppVersionInfo | null>(null);

const isDevBuild = computed(() => info.value?.current === 'dev');
const displayCurrent = computed(() => info.value?.current ?? '—');

onMounted(async () => {
  try {
    info.value = await apiGet<AppVersionInfo>('/api/system/version');
  } catch {
    info.value = null;
  } finally {
    loading.value = false;
  }
});
</script>
