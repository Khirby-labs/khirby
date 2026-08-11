<template>
  <div class="flex h-[calc(100vh-7rem)] min-h-0 min-w-0 w-full max-w-full overflow-hidden">
    <!-- Sidebar -->
    <aside
      class="w-56 flex-shrink-0 border-r border-border pr-3 flex flex-col gap-3 overflow-y-auto"
    >
      <RouterLink
        :to="{ name: 'boards-my' }"
        class="flex items-center gap-2 px-2.5 py-2 rounded-md text-sm transition-colors"
        :class="
          isMy
            ? 'bg-surface-raise text-text-primary'
            : 'text-text-muted hover:bg-surface-raise hover:text-text-primary'
        "
      >
        {{ t('boards.sidebar.myTasks') }}
      </RouterLink>

      <div class="flex items-center justify-between px-2.5 pt-2">
        <span class="text-xs font-medium uppercase tracking-wider text-text-ghost">
          {{ t('boards.sidebar.projects') }}
        </span>
        <button
          type="button"
          class="text-xs text-accent hover:text-accent-hover"
          @click="showNewProject = true"
        >
          +
        </button>
      </div>

      <div v-if="showNewProject" class="px-2 space-y-1.5">
        <input
          v-model="newProjectName"
          class="w-full px-2 py-1.5 rounded bg-surface-input border border-border text-text-primary text-sm focus:outline-none focus:border-accent"
          :placeholder="t('boards.project.namePlaceholder')"
          @keydown.enter="createProject"
          @keydown.escape="showNewProject = false"
        />
        <input
          v-model="newProjectKey"
          class="w-full px-2 py-1.5 rounded bg-surface-input border border-border text-text-primary text-sm font-mono uppercase focus:outline-none focus:border-accent"
          :placeholder="t('boards.project.keyPlaceholder')"
          maxlength="10"
          @keydown.enter="createProject"
          @keydown.escape="showNewProject = false"
        />
        <p class="text-[10px] text-text-ghost px-0.5">{{ t('boards.project.keyHint') }}</p>
        <div class="flex gap-1">
          <button type="button" class="btn-primary text-xs px-2 py-1" @click="createProject">
            {{ t('common.actions.save') }}
          </button>
          <button type="button" class="btn-ghost text-xs px-2 py-1" @click="showNewProject = false">
            {{ t('common.actions.cancel') }}
          </button>
        </div>
      </div>

      <div v-for="project in store.projects" :key="project.id" class="space-y-0.5">
        <RouterLink
          :to="{ name: 'boards-project', params: { projectId: project.id } }"
          class="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors"
          :class="
            route.params.projectId === project.id
              ? 'bg-surface-raise text-text-primary'
              : 'text-text-muted hover:bg-surface-raise hover:text-text-primary'
          "
        >
          <span
            class="w-2 h-2 rounded-full flex-shrink-0"
            :style="{ backgroundColor: project.color }"
          />
          <span class="truncate">{{ project.name }}</span>
          <span class="ml-auto font-mono text-[10px] text-text-ghost">{{ project.key }}</span>
        </RouterLink>

        <RouterLink
          v-for="mod in modulesByProject(project.id)"
          :key="mod.id"
          :to="{ name: 'boards-module', params: { moduleId: mod.id } }"
          class="flex items-center gap-2 pl-6 pr-2.5 py-1 rounded-md text-xs transition-colors"
          :class="
            route.params.moduleId === mod.id
              ? 'bg-surface-raise text-text-primary'
              : 'text-text-ghost hover:bg-surface-raise hover:text-text-muted'
          "
        >
          <span class="truncate">{{ mod.name }}</span>
        </RouterLink>
      </div>
    </aside>

    <!-- Main -->
    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pl-4">
      <RouterView />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useBoardsStore } from '../../stores/boards.store';
import { useToastStore } from '../../stores/toast.store';

const { t } = useI18n();
const route = useRoute();
const store = useBoardsStore();
const toast = useToastStore();

const showNewProject = ref(false);
const newProjectName = ref('');
const newProjectKey = ref('');
const allModules = ref<Record<string, Awaited<ReturnType<typeof store.fetchModules>>>>({});

const isMy = computed(() => route.name === 'boards-my' || route.name === 'boards');

function modulesByProject(projectId: string) {
  return allModules.value[projectId] ?? [];
}

async function loadTree() {
  await store.fetchProjects();
  const map: typeof allModules.value = {};
  await Promise.all(
    store.projects.map(async (p) => {
      map[p.id] = await store.fetchModules(p.id);
    }),
  );
  allModules.value = map;
}

async function createProject() {
  const name = newProjectName.value.trim();
  if (!name) return;
  const key = newProjectKey.value.trim() || undefined;
  try {
    await store.createProject({ name, key });
    newProjectName.value = '';
    newProjectKey.value = '';
    showNewProject.value = false;
    await loadTree();
  } catch {
    toast.error(t('boards.errors.createProject'));
  }
}

onMounted(loadTree);
</script>
