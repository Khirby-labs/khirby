<template>
  <div class="flex h-full min-h-0 min-w-0 w-full max-w-full flex-col gap-4 overflow-hidden">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0 space-y-1">
        <h2 class="crm-page-title">
          <span v-if="project?.key" class="font-mono text-sm text-text-ghost mr-2 tracking-wide">{{
            project.key
          }}</span>
          {{ project?.name ?? t('nav.workspace.boards') }}
        </h2>
        <div v-if="editingKey" class="flex items-center gap-2">
          <input
            v-model="editKey"
            class="w-28 px-2 py-1 rounded bg-surface-input border border-border text-text-primary text-sm font-mono uppercase focus:outline-none focus:border-accent"
            maxlength="10"
            :aria-label="t('boards.project.key')"
            @keydown.enter="saveKey"
            @keydown.escape="editingKey = false"
          />
          <button type="button" class="btn-primary text-xs px-2 py-1" @click="saveKey">
            {{ t('common.actions.save') }}
          </button>
          <button type="button" class="btn-ghost text-xs px-2 py-1" @click="editingKey = false">
            {{ t('common.actions.cancel') }}
          </button>
        </div>
        <button
          v-else-if="project"
          type="button"
          class="text-xs text-text-ghost hover:text-accent"
          @click="startEditKey"
        >
          {{ t('boards.project.editKey') }}
        </button>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="btn-ghost text-sm px-3 py-1.5"
          :class="tab === 'kanban' ? 'bg-surface-raise text-text-primary' : ''"
          @click="tab = 'kanban'"
        >
          {{ t('boards.project.kanban') }}
        </button>
        <button
          type="button"
          class="btn-ghost text-sm px-3 py-1.5"
          :class="tab === 'list' ? 'bg-surface-raise text-text-primary' : ''"
          @click="tab = 'list'"
        >
          {{ t('boards.project.list') }}
        </button>
        <button
          type="button"
          class="btn-ghost text-sm px-3 py-1.5"
          :class="tab === 'statuses' ? 'bg-surface-raise text-text-primary' : ''"
          @click="tab = 'statuses'"
        >
          {{ t('boards.project.statuses') }}
        </button>
        <button type="button" class="btn-ghost text-sm px-3 py-1.5" @click="showNewModule = true">
          + {{ t('boards.module.new') }}
        </button>
      </div>
    </div>

    <div v-if="showNewModule" class="flex gap-2 max-w-md">
      <input
        v-model="newModuleName"
        class="flex-1 px-3 py-2 rounded bg-surface-input border border-border text-text-primary text-sm focus:outline-none focus:border-accent"
        :placeholder="t('boards.module.namePlaceholder')"
        @keydown.enter="createModule"
      />
      <button type="button" class="btn-primary text-sm px-3" @click="createModule">
        {{ t('common.actions.save') }}
      </button>
      <button type="button" class="btn-ghost text-sm px-3" @click="showNewModule = false">
        {{ t('common.actions.cancel') }}
      </button>
    </div>

    <div v-if="tab === 'list'" class="flex flex-wrap gap-2">
      <select
        v-model="filterModule"
        class="px-2 py-1.5 rounded bg-surface-input border border-border text-text-primary text-sm"
        @change="reload"
      >
        <option value="">{{ t('boards.filters.allModules') }}</option>
        <option v-for="m in modules" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
      <select
        v-model="filterPriority"
        class="px-2 py-1.5 rounded bg-surface-input border border-border text-text-primary text-sm"
        @change="reload"
      >
        <option value="">{{ t('boards.filters.allPriorities') }}</option>
        <option value="low">{{ t('boards.priority.low') }}</option>
        <option value="medium">{{ t('boards.priority.medium') }}</option>
        <option value="high">{{ t('boards.priority.high') }}</option>
        <option value="urgent">{{ t('boards.priority.urgent') }}</option>
      </select>
    </div>

    <div v-if="store.error" class="crm-error">{{ store.error }}</div>

    <div v-if="tab === 'kanban'" class="flex-1 min-h-0 overflow-auto space-y-3">
      <RouterLink
        v-for="mod in modules"
        :key="mod.id"
        :to="{ name: 'boards-module', params: { moduleId: mod.id } }"
        class="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-surface-raise hover:border-accent/40 transition-colors"
      >
        <span class="text-sm font-medium text-text-primary">{{ mod.name }}</span>
        <span class="text-text-ghost text-xs">→</span>
      </RouterLink>
    </div>

    <ProjectStatusesPanel v-else-if="tab === 'statuses'" :project-id="projectId" />

    <div v-else class="min-h-0 min-w-0 flex-1 overflow-auto">
      <table class="w-full min-w-[40rem] text-sm">
        <thead class="text-left text-text-ghost border-b border-border">
          <tr>
            <th class="py-2 pr-3 font-medium">{{ t('boards.list.id') }}</th>
            <th class="py-2 pr-3 font-medium">{{ t('boards.list.title') }}</th>
            <th class="py-2 pr-3 font-medium">{{ t('boards.list.module') }}</th>
            <th class="py-2 pr-3 font-medium">{{ t('boards.list.status') }}</th>
            <th class="py-2 pr-3 font-medium">{{ t('boards.list.priority') }}</th>
            <th class="py-2 pr-3 font-medium">{{ t('boards.list.assignees') }}</th>
            <th class="py-2 font-medium">{{ t('boards.list.dueDate') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="task in store.projectTasks"
            :key="task.id"
            class="border-b border-border/50 hover:bg-surface-raise cursor-pointer"
            @click="openTask(task)"
          >
            <td class="py-2.5 pr-3 font-mono text-xs text-text-ghost">{{ task.identifier }}</td>
            <td class="py-2.5 pr-3 text-text-primary">{{ task.title }}</td>
            <td class="py-2.5 pr-3 text-text-muted">{{ task.module?.name }}</td>
            <td class="py-2.5 pr-3 text-text-muted">{{ task.status?.name ?? '—' }}</td>
            <td class="py-2.5 pr-3 text-text-muted">
              {{ t(`boards.priority.${task.priority}`) }}
            </td>
            <td class="py-2.5 pr-3 text-text-muted">
              {{ (task.assignees ?? []).map((a) => a.email).join(', ') || '—' }}
            </td>
            <td class="py-2.5 text-text-muted">
              {{ task.dueDate ? d(new Date(task.dueDate), 'dateShort') : '—' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useBoardsStore, type TbModule, type TbProject } from '../../stores/boards.store';
import { useToastStore } from '../../stores/toast.store';
import { apiGet } from '../../api/client';
import { boardsTaskLocation } from '../../utils/task-path';
import ProjectStatusesPanel from './components/ProjectStatusesPanel.vue';

const { t, d } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useBoardsStore();
const toast = useToastStore();

const projectId = computed(() => route.params.projectId as string);
const project = ref<TbProject | null>(null);
const modules = ref<TbModule[]>([]);
const tab = ref<'kanban' | 'list' | 'statuses'>('list');
const filterModule = ref('');
const filterPriority = ref('');
const showNewModule = ref(false);
const newModuleName = ref('');
const editingKey = ref(false);
const editKey = ref('');

async function reload() {
  if (!projectId.value) return;
  project.value =
    store.projects.find((p) => p.id === projectId.value) ??
    (await apiGet<TbProject>(`/api/boards/projects/${projectId.value}`));
  modules.value = await store.fetchModules(projectId.value);
  store.currentProject = project.value;

  const filters: Record<string, string> = {};
  if (filterModule.value) filters.moduleId = filterModule.value;
  if (filterPriority.value) filters.priority = filterPriority.value;
  await store.fetchProjectTasks(projectId.value, filters);
}

function startEditKey() {
  editKey.value = project.value?.key ?? '';
  editingKey.value = true;
}

async function saveKey() {
  if (!project.value) return;
  const key = editKey.value.trim().toUpperCase();
  if (key.length < 2) {
    toast.error(t('boards.errors.invalidKey'));
    return;
  }
  try {
    project.value = await store.updateProject(project.value.id, { key });
    editingKey.value = false;
    await reload();
  } catch {
    toast.error(t('boards.errors.save'));
  }
}

async function createModule() {
  const name = newModuleName.value.trim();
  if (!name) return;
  try {
    await store.createModule({ projectId: projectId.value, name });
    newModuleName.value = '';
    showNewModule.value = false;
    await reload();
  } catch {
    toast.error(t('boards.errors.save'));
  }
}

function openTask(task: { identifier: string; title: string }) {
  router.push(boardsTaskLocation(task));
}

onMounted(reload);
watch(projectId, reload);
</script>
