<template>
  <div
    class="min-w-0 cursor-grab space-y-2 rounded-lg border border-border bg-surface-panel p-3 transition-colors hover:border-accent/40 active:cursor-grabbing"
    @click="emit('open', task)"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0 space-y-0.5">
        <p
          v-if="task.identifier"
          class="text-[10px] font-mono font-semibold text-text-ghost tracking-wide"
        >
          {{ task.identifier }}
        </p>
        <p class="text-sm text-text-primary font-medium leading-snug">{{ task.title }}</p>
      </div>
      <span
        class="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0"
        :class="priorityClass"
      >
        {{ t(`boards.priority.${task.priority}`) }}
      </span>
    </div>

    <div v-if="task.tags?.length" class="flex flex-wrap gap-1">
      <span
        v-for="tag in task.tags"
        :key="tag.id"
        class="text-[10px] px-1.5 py-0.5 rounded"
        :style="{ backgroundColor: `${tag.color}22`, color: tag.color }"
      >
        {{ tag.name }}
      </span>
    </div>

    <div class="flex items-center justify-between gap-2 text-xs text-text-ghost">
      <div class="flex items-center -space-x-1.5">
        <span
          v-for="a in visibleAssignees"
          :key="a.id"
          class="w-5 h-5 rounded-full bg-surface-raise border border-border flex items-center justify-center text-[9px] text-text-muted"
          :title="a.email"
        >
          {{ initials(a.email) }}
        </span>
        <span v-if="extraAssignees > 0" class="text-[10px] pl-2">+{{ extraAssignees }}</span>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="task.subtaskCount" class="tabular-nums">⊞ {{ task.subtaskCount }}</span>
        <span v-if="task.commentCount" class="tabular-nums">💬 {{ task.commentCount }}</span>
        <span v-if="task.dueDate" :class="overdue ? 'text-danger' : ''">
          {{ d(new Date(task.dueDate), 'dateShort') }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TbTask } from '../../../stores/boards.store';

const props = defineProps<{ task: TbTask }>();
const emit = defineEmits<{ open: [task: TbTask] }>();
const { t, d } = useI18n();

const visibleAssignees = computed(() => (props.task.assignees ?? []).slice(0, 3));
const extraAssignees = computed(() => Math.max(0, (props.task.assignees?.length ?? 0) - 3));
const overdue = computed(() => {
  if (!props.task.dueDate) return false;
  return new Date(props.task.dueDate).getTime() < Date.now() && !props.task.status?.isDone;
});

const priorityClass = computed(() => {
  switch (props.task.priority) {
    case 'urgent':
      return 'bg-danger/15 text-danger';
    case 'high':
      return 'bg-warning/15 text-warning';
    case 'low':
      return 'bg-surface-raise text-text-ghost';
    default:
      return 'bg-accent/15 text-accent';
  }
});

function initials(email: string) {
  return email.slice(0, 2).toUpperCase();
}
</script>
