<template>
  <div class="flex items-center justify-between px-1 pt-2">
    <p class="text-xs text-text-ghost">
      {{ t('common.pagination.pageOf', { current: currentPage, total: totalPages }) }}
    </p>
    <div class="flex gap-2">
      <button
        :disabled="currentPage <= 1"
        class="btn-ghost px-3 py-1.5 text-xs disabled:opacity-30"
        :aria-label="t('common.pagination.goToPage', { page: currentPage - 1 })"
        @click="$emit('prev')"
      >
        <span aria-hidden="true">←</span> {{ t('common.pagination.prev') }}
      </button>
      <button
        :disabled="currentPage >= totalPages"
        class="btn-ghost px-3 py-1.5 text-xs disabled:opacity-30"
        :aria-label="t('common.pagination.goToPage', { page: currentPage + 1 })"
        @click="$emit('next')"
      >
        {{ t('common.pagination.next') }} <span aria-hidden="true">→</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

defineProps<{
  currentPage: number;
  totalPages: number;
}>();

defineEmits<{
  (e: 'prev'): void;
  (e: 'next'): void;
}>();
</script>
