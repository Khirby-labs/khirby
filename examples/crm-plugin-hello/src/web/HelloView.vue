<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n({
  messages: {
    en: { title: 'Hello plugin', body: 'Community plugin UI is wired via exports["./web"].' },
    pl: {
      title: 'Wtyczka Hello',
      body: 'UI wtyczki społecznościowej idzie przez exports["./web"].',
    },
  },
});
</script>

<template>
  <div class="space-y-2 p-6">
    <h1 class="text-xl font-semibold text-fg">{{ t('title') }}</h1>
    <p class="text-sm text-fg-muted">{{ t('body') }}</p>
  </div>
</template>
