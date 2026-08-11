<template>
  <div class="space-y-2" role="status">
    <div
      v-for="i in rows"
      :key="i"
      class="animate-pulse rounded-lg bg-surface-raise2"
      :style="{ height }"
    />
    <span class="sr-only">{{ t('common.state.loading') }}</span>
  </div>
</template>

<script setup lang="ts">
/**
 * Loading skeleton — token pulse blocks matching the shape of the content that
 * will replace them (docs/DESIGN-SYSTEM.md §5). Use for lists/cards; tables get their
 * skeleton from AppTable's own loading prop.
 */
import { useI18n } from 'vue-i18n';

// One announcement, not two: the aria-label used to duplicate this sr-only text,
// so screen readers said "Loading" twice in slightly different words.
const { t } = useI18n();

withDefaults(defineProps<{ rows?: number; height?: string }>(), {
  rows: 5,
  height: '3rem',
});
</script>
