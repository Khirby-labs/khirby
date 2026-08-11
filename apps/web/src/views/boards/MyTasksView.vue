<template>
  <div class="flex flex-col h-full gap-4 overflow-hidden">
    <h2 class="crm-page-title">{{ t('boards.my.title') }}</h2>

    <div v-if="store.error" class="crm-error">{{ store.error }}</div>

    <div v-if="store.loading" class="space-y-2">
      <div v-for="i in 4" :key="i" class="h-14 bg-surface-raise animate-pulse rounded-lg" />
    </div>

    <div
      v-else-if="!store.myTasks.length"
      class="flex flex-col items-center justify-center py-16 text-center"
    >
      <p class="text-text-primary font-medium">{{ t('boards.my.empty.title') }}</p>
      <p class="text-sm text-text-muted mt-1">{{ t('boards.my.empty.message') }}</p>
    </div>

    <div v-else class="space-y-6 overflow-y-auto">
      <div v-for="group in grouped" :key="group.key" class="space-y-2">
        <h3 class="text-sm font-semibold text-text-muted px-1">
          {{ group.projectName }} · {{ group.moduleName }}
        </h3>
        <TaskCard v-for="task in group.tasks" :key="task.id" :task="task" @open="openTask" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useBoardsStore, type TbTask } from '../../stores/boards.store';
import TaskCard from './components/TaskCard.vue';
import { boardsTaskLocation } from '../../utils/task-path';

const { t } = useI18n();
const router = useRouter();
const store = useBoardsStore();

const grouped = computed(() => {
  const map = new Map<
    string,
    { key: string; projectName: string; moduleName: string; tasks: TbTask[] }
  >();
  for (const task of store.myTasks) {
    const key = `${task.project?.id ?? ''}:${task.module?.id ?? ''}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        projectName: task.project?.name ?? '—',
        moduleName: task.module?.name ?? '—',
        tasks: [],
      });
    }
    map.get(key)!.tasks.push(task);
  }
  return [...map.values()];
});

function openTask(task: TbTask) {
  router.push(boardsTaskLocation(task));
}

onMounted(() => store.fetchMyTasks());
</script>
