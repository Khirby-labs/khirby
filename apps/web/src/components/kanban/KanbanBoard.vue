<template>
  <div
    class="flex h-full min-h-0 min-w-0 w-full max-w-full items-stretch gap-4 overflow-x-auto pb-4"
  >
    <div
      v-for="status in sortedStatuses"
      :key="status.id"
      class="flex w-72 min-w-72 max-w-72 shrink-0 grow-0 flex-col gap-2 self-stretch rounded-xl border border-border bg-surface-raise p-3"
    >
      <div class="mb-1 flex shrink-0 items-center gap-2">
        <div class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ backgroundColor: status.color }" />
        <h3 class="text-sm font-semibold text-text-primary">
          {{ status.name }}
          <span class="font-normal text-text-ghost"> ({{ columnTasks(status.id).length }}) </span>
        </h3>
      </div>

      <div class="relative flex min-h-[8rem] min-w-0 flex-1 flex-col gap-2">
        <VueDraggable
          v-model="columns[status.id]"
          group="tasks"
          :animation="150"
          class="flex min-w-0 flex-col gap-2"
          :class="
            columnTasks(status.id).length
              ? 'shrink-0'
              : 'min-h-full flex-1 cursor-pointer rounded-lg border-2 border-dashed border-border p-2 transition-colors hover:border-accent'
          "
          @add="(evt) => onListChange(evt, status.id)"
          @update="(evt) => onListChange(evt, status.id)"
          @click="onEmptyColumnClick($event, status.id)"
        >
          <TaskCard
            v-for="task in columnTasks(status.id)"
            :key="task.id"
            data-board-task
            :task="task"
            @open="(task) => emit('open-task', task)"
          />
        </VueDraggable>

        <!-- Empty column hint (does not capture clicks — list underneath does). -->
        <div
          v-if="!columnTasks(status.id).length"
          class="pointer-events-none absolute inset-0 flex items-center justify-center px-3 text-center text-sm leading-snug text-text-ghost"
        >
          {{ t('boards.board.emptyColumn') }}
        </div>

        <!-- Filled column: separate create/drop strip below cards (never overlays them). -->
        <button
          v-else
          type="button"
          class="flex min-h-[5.5rem] flex-1 items-center justify-center rounded-lg border-2 border-dashed border-border px-3 py-4 text-center text-sm leading-snug text-text-ghost transition-colors hover:border-accent hover:text-accent"
          :aria-label="t('boards.board.emptyColumnCreateAria', { status: status.name })"
          @click="emit('request-create', status.id)"
        >
          {{ t('boards.board.emptyColumn') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { VueDraggable } from 'vue-draggable-plus';
import type { TbStatus, TbTask } from '../../stores/boards.store';
import TaskCard from '../../views/boards/components/TaskCard.vue';

const props = defineProps<{
  statuses: TbStatus[];
  tasks: TbTask[];
  moduleId: string;
}>();

const emit = defineEmits<{
  'task-moved': [taskId: string, statusId: string, position: number];
  'open-task': [task: TbTask];
  'request-create': [statusId: string];
}>();

const { t } = useI18n();
const columns = reactive<Record<string, TbTask[]>>({});
/** Skip prop→columns sync while a drag is mutating local lists. */
const syncingFromProps = ref(true);

const sortedStatuses = computed(() => [...props.statuses].sort((a, b) => a.position - b.position));

function columnTasks(statusId: string): TbTask[] {
  return columns[statusId] ?? [];
}

function rebuildColumns() {
  for (const s of props.statuses) {
    columns[s.id] = props.tasks
      .filter((t) => t.statusId === s.id)
      .sort((a, b) => a.position - b.position)
      .map((t) => ({ ...t }));
  }
}

watch(
  () => [props.statuses, props.tasks] as const,
  () => {
    if (!syncingFromProps.value) return;
    rebuildColumns();
  },
  { immediate: true, deep: true },
);

/**
 * `@add` = dropped into this column from another; `@update` = reordered inside.
 * Never use `@end` on the source list — Sortable sets newIndex to null there and
 * coercing to 0 would PATCH the wrong card.
 */
function onListChange(evt: { newIndex?: number | null }, statusId: string) {
  const idx = evt.newIndex;
  if (idx == null || idx < 0) return;
  const list = columns[statusId] ?? [];
  const task = list[idx];
  if (!task) return;

  syncingFromProps.value = false;
  emit('task-moved', task.id, statusId, idx);
  queueMicrotask(() => {
    syncingFromProps.value = true;
  });
}

/** Only empty columns use the list surface as the create click target. */
function onEmptyColumnClick(evt: MouseEvent, statusId: string) {
  if (columnTasks(statusId).length) return;
  const target = evt.target as HTMLElement | null;
  if (target?.closest('[data-board-task]')) return;
  emit('request-create', statusId);
}
</script>
