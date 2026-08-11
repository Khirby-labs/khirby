<template>
  <div
    draggable="true"
    class="bg-surface-elevated border border-border rounded-lg p-3 relative cursor-grab hover:bg-surface-hover transition-colors"
    :class="lead.hasNewMail ? 'border-info ring-1 ring-info/50 bg-info/[0.04]' : ''"
    :aria-label="cardAriaLabel"
    @dragstart="onDragStart"
    @click="$emit('open', lead.id)"
  >
    <div class="h-[3px] rounded-t-lg -mx-3 -mt-3 mb-2" :style="{ backgroundColor: stageColor }" />

    <!-- Card-level mail badge (corner), not an inline chip -->
    <span
      v-if="lead.hasNewMail"
      class="absolute top-2.5 right-2.5 flex h-2.5 w-2.5"
      :title="mailTitle"
      aria-hidden="true"
    >
      <span class="absolute inline-flex h-full w-full rounded-full bg-info opacity-40" />
      <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-info" />
    </span>

    <p class="text-sm font-semibold text-text-primary pr-8 truncate">{{ lead.title }}</p>
    <p class="text-xs text-text-muted truncate mb-2">{{ lead.contactEmail }}</p>

    <div class="flex flex-wrap gap-1">
      <span v-if="lead.formName" class="text-xs px-1.5 py-0.5 rounded bg-accent-subtle text-accent">
        {{ lead.formName }}
      </span>
      <span class="text-xs px-1.5 py-0.5 rounded" :class="priorityBadgeClass(lead.priority)">
        {{ priorityLabel(lead.priority) }}
      </span>
      <span
        v-if="lead.value"
        class="text-xs px-1.5 py-0.5 rounded bg-surface-raise2 text-text-secondary"
      >
        {{ formatCurrency(lead.value) }}
      </span>
    </div>

    <div
      v-if="lead.ownerEmail"
      class="absolute bottom-3 right-3 w-6 h-6 rounded-full bg-surface-raise2 text-xs flex items-center justify-center text-text-secondary"
      :title="lead.ownerEmail"
    >
      {{ getInitials(lead.ownerEmail) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { LeadBoardItem } from '@khirby/types';
import {
  formatCurrency,
  getInitials,
  priorityBadgeClass,
  priorityLabel,
} from '../../utils/pipeline-helpers';

const { t, d } = useI18n();

const props = defineProps<{
  lead: LeadBoardItem;
  stageColor: string;
}>();

defineEmits<{
  (e: 'open', id: string): void;
}>();

const mailTitle = computed(() => {
  if (!props.lead.hasNewMail) return undefined;
  const base = t('pipeline.board.newMail');
  if (!props.lead.lastMailAt) return base;
  return `${base} · ${d(props.lead.lastMailAt, 'dateTime')}`;
});

const cardAriaLabel = computed(() => {
  const parts = [props.lead.title, props.lead.contactEmail];
  if (props.lead.hasNewMail) parts.push(t('pipeline.board.newMail'));
  return parts.filter(Boolean).join(', ');
});

function onDragStart(event: DragEvent) {
  event.dataTransfer?.setData('leadId', props.lead.id);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
}
</script>
