<template>
  <div class="flex min-h-0 min-w-0 w-full max-w-full flex-col gap-4 overflow-hidden">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="crm-page-title">
        {{ store.currentModule?.name ?? t('nav.workspace.boards') }}
      </h2>
      <button type="button" class="btn-ghost px-3 py-2 text-sm" @click="openCreate()">
        + {{ t('boards.board.newTask') }}
      </button>
    </div>

    <div v-if="store.error" class="crm-error">{{ store.error }}</div>

    <div v-if="store.loading && !store.board" class="flex min-w-0 gap-4 overflow-x-auto pb-2">
      <div
        v-for="i in 4"
        :key="i"
        class="h-48 w-72 flex-shrink-0 rounded-xl bg-surface-raise animate-pulse"
      />
    </div>

    <KanbanBoard
      v-else-if="store.board"
      :statuses="store.board.statuses"
      :tasks="store.board.tasks"
      :module-id="moduleId"
      class="min-h-0 min-w-0 flex-1"
      @task-moved="onMoved"
      @open-task="openTask"
      @request-create="openCreate"
    />

    <AppModal v-if="showCreate" :title="t('boards.board.newTaskTitle')" @close="closeCreate">
      <form class="space-y-3" @submit.prevent="submitCreate">
        <input
          ref="titleInput"
          v-model="createTitle"
          type="text"
          required
          autofocus
          class="crm-input w-full focus:border-accent focus:outline-none"
          :placeholder="t('boards.board.titlePlaceholder')"
        />
        <select v-model="createStatusId" class="crm-input w-full" required>
          <option v-for="s in store.board?.statuses ?? []" :key="s.id" :value="s.id">
            {{ s.name }}
          </option>
        </select>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="btn-ghost text-sm px-3 py-1.5" @click="closeCreate">
            {{ t('common.actions.cancel') }}
          </button>
          <button type="submit" class="btn-primary text-sm px-3 py-1.5" :disabled="creating">
            {{ t('common.actions.create') }}
          </button>
        </div>
      </form>
    </AppModal>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useBoardsStore } from '../../stores/boards.store';
import { useToastStore } from '../../stores/toast.store';
import AppModal from '../../components/AppModal.vue';
import KanbanBoard from '../../components/kanban/KanbanBoard.vue';
import { boardsTaskLocation } from '../../utils/task-path';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useBoardsStore();
const toast = useToastStore();

const moduleId = computed(() => route.params.moduleId as string);
const showCreate = ref(false);
const createTitle = ref('');
const createStatusId = ref('');
const creating = ref(false);
const titleInput = ref<HTMLInputElement | null>(null);

async function reload() {
  if (moduleId.value) await store.fetchBoard(moduleId.value);
}

async function onMoved(taskId: string, statusId: string, position: number) {
  try {
    await store.moveTask(taskId, statusId, position);
  } catch {
    toast.error(t('boards.errors.move'));
    await reload();
  }
}

function defaultStatusId() {
  const statuses = store.board?.statuses ?? [];
  return statuses.find((s) => s.isBacklog)?.id ?? statuses[0]?.id ?? '';
}

async function openCreate(statusId?: string) {
  createTitle.value = '';
  createStatusId.value = statusId || defaultStatusId();
  if (!createStatusId.value) {
    toast.error(t('boards.errors.createTask'));
    return;
  }
  showCreate.value = true;
  await nextTick();
  titleInput.value?.focus();
}

function closeCreate() {
  showCreate.value = false;
  createTitle.value = '';
}

async function submitCreate() {
  const title = createTitle.value.trim();
  if (!title || !createStatusId.value) return;
  creating.value = true;
  try {
    await store.createTask({
      moduleId: moduleId.value,
      title,
      statusId: createStatusId.value,
    });
    closeCreate();
    await reload();
  } catch {
    toast.error(t('boards.errors.createTask'));
  } finally {
    creating.value = false;
  }
}

function openTask(task: { identifier: string; title: string }) {
  router.push(boardsTaskLocation(task));
}

onMounted(reload);
watch(moduleId, reload);
</script>
