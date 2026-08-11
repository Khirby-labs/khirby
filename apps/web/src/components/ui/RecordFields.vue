<template>
  <dl v-if="rows.length" class="space-y-2.5">
    <div v-for="row in rows" :key="row.key" class="min-w-0">
      <dt class="text-xs text-text-ghost">{{ row.label }}</dt>
      <dd
        class="text-sm text-text-secondary mt-0.5 break-words"
        :class="row.multiline ? 'whitespace-pre-wrap' : ''"
      >
        {{ row.value }}
      </dd>
    </div>
  </dl>
</template>

<script setup lang="ts">
import type { RecordFieldRow } from '../../utils/record-fields';

defineProps<{
  rows: RecordFieldRow[];
}>();
</script>
