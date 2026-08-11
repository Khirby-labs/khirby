import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/client';

export interface TbProject {
  id: string;
  name: string;
  description: string | null;
  color: string;
  key: string;
  taskSeq?: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  defaultModuleId?: string;
}

export interface TbModule {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  position: number;
  createdAt: string;
}

export interface TbStatus {
  id: string;
  projectId: string | null;
  moduleId: string | null;
  name: string;
  color: string;
  position: number;
  isBacklog: boolean;
  isDone: boolean;
  isCanceled: boolean;
}

export interface TbAssignee {
  id: string;
  email: string;
}

export interface TbTag {
  id: string;
  name: string;
  color: string;
}

export interface TbTask {
  id: string;
  moduleId: string;
  statusId: string | null;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  position: number;
  number: number;
  identifier: string;
  dueDate: string | null;
  leadId: string | null;
  canceledAt?: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  status?: {
    id: string;
    name: string;
    color: string;
    isBacklog: boolean;
    isDone: boolean;
    isCanceled?: boolean;
  } | null;
  module?: { id: string; name: string; projectId: string };
  project?: { id: string; name: string; color: string; key?: string };
  assignees?: TbAssignee[];
  tags?: TbTag[];
  commentCount?: number;
  subtaskCount?: number;
}

export interface BoardPayload {
  statuses: TbStatus[];
  tasks: TbTask[];
}

export const useBoardsStore = defineStore('boards', () => {
  const projects = ref<TbProject[]>([]);
  const modules = ref<TbModule[]>([]);
  const currentProject = ref<TbProject | null>(null);
  const currentModule = ref<TbModule | null>(null);
  const myTasks = ref<TbTask[]>([]);
  const board = ref<BoardPayload | null>(null);
  const projectTasks = ref<TbTask[]>([]);
  const selectedTask = ref<TbTask | null>(null);
  const tags = ref<TbTag[]>([]);
  const loading = ref(false);
  const error = ref('');
  const dragging = ref(false);

  async function fetchProjects() {
    projects.value = await apiGet<TbProject[]>('/api/boards/projects');
    return projects.value;
  }

  async function fetchModules(projectId: string) {
    modules.value = await apiGet<TbModule[]>(
      `/api/boards/modules?projectId=${encodeURIComponent(projectId)}`,
    );
    return modules.value;
  }

  async function fetchMyTasks() {
    loading.value = true;
    error.value = '';
    try {
      myTasks.value = await apiGet<TbTask[]>('/api/boards/tasks/my');
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'load failed';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchBoard(moduleId: string) {
    if (dragging.value) return board.value;
    loading.value = true;
    error.value = '';
    try {
      board.value = await apiGet<BoardPayload>(
        `/api/boards/modules/${encodeURIComponent(moduleId)}/board`,
      );
      const mod = modules.value.find((m) => m.id === moduleId);
      if (mod) currentModule.value = mod;
      else {
        currentModule.value = await apiGet<TbModule>(
          `/api/boards/modules/${encodeURIComponent(moduleId)}`,
        );
      }
      return board.value;
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'load failed';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchProjectTasks(projectId: string, filters: Record<string, string> = {}) {
    loading.value = true;
    error.value = '';
    try {
      const params = new URLSearchParams({ projectId, ...filters });
      projectTasks.value = await apiGet<TbTask[]>(`/api/boards/tasks?${params}`);
      return projectTasks.value;
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'load failed';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createProject(payload: {
    name: string;
    description?: string;
    color?: string;
    key?: string;
  }) {
    const created = await apiPost<TbProject>('/api/boards/projects', payload);
    await fetchProjects();
    return created;
  }

  async function updateProject(
    id: string,
    payload: { name?: string; description?: string | null; color?: string; key?: string },
  ) {
    const updated = await apiPatch<TbProject>(`/api/boards/projects/${id}`, payload);
    await fetchProjects();
    return updated;
  }

  async function createModule(payload: { projectId: string; name: string }) {
    const created = await apiPost<TbModule>('/api/boards/modules', payload);
    await fetchModules(payload.projectId);
    return created;
  }

  async function createTask(payload: {
    moduleId: string;
    title: string;
    statusId?: string;
    parentTaskId?: string;
    assigneeIds?: string[];
  }) {
    const created = await apiPost<TbTask>('/api/boards/tasks', payload);
    return created;
  }

  async function moveTask(taskId: string, statusId: string, position: number) {
    const snapshot = board.value ? (JSON.parse(JSON.stringify(board.value)) as BoardPayload) : null;

    if (board.value) {
      const task = board.value.tasks.find((t) => t.id === taskId);
      if (task) {
        task.statusId = statusId;
        task.position = position;
      }
    }

    dragging.value = true;
    try {
      await apiPatch(`/api/boards/tasks/${taskId}/status`, { statusId, position });
    } catch (err) {
      if (snapshot) board.value = snapshot;
      throw err;
    } finally {
      setTimeout(() => {
        dragging.value = false;
      }, 200);
    }
  }

  async function fetchTask(id: string) {
    selectedTask.value = await apiGet<TbTask>(`/api/boards/tasks/${id}`);
    return selectedTask.value;
  }

  async function updateTask(id: string, patch: Record<string, unknown>) {
    selectedTask.value = await apiPatch<TbTask>(`/api/boards/tasks/${id}`, patch);
    return selectedTask.value;
  }

  async function addComment(taskId: string, body: string) {
    return apiPost(`/api/boards/tasks/${taskId}/comments`, { body });
  }

  async function fetchActivity(taskId: string) {
    return apiGet(`/api/boards/tasks/${taskId}/activity`);
  }

  async function fetchTags() {
    tags.value = await apiGet<TbTag[]>('/api/boards/tags');
    return tags.value;
  }

  async function fetchAssignees() {
    return apiGet<TbAssignee[]>('/api/boards/assignees');
  }

  async function deleteProject(id: string) {
    await apiDelete(`/api/boards/projects/${id}`);
    await fetchProjects();
  }

  async function fetchProjectStatuses(projectId: string) {
    return apiGet<TbStatus[]>(`/api/boards/statuses?projectId=${encodeURIComponent(projectId)}`);
  }

  async function createStatus(payload: {
    projectId: string;
    name: string;
    color?: string;
    isBacklog?: boolean;
    isDone?: boolean;
    isCanceled?: boolean;
  }) {
    return apiPost<TbStatus>('/api/boards/statuses', payload);
  }

  async function updateStatus(
    id: string,
    patch: {
      name?: string;
      color?: string;
      isBacklog?: boolean;
      isDone?: boolean;
      isCanceled?: boolean;
    },
  ) {
    return apiPatch<TbStatus>(`/api/boards/statuses/${id}`, patch);
  }

  async function reorderStatuses(projectId: string, ids: string[]) {
    return apiPost<TbStatus[]>('/api/boards/statuses/reorder', { projectId, ids });
  }

  async function deleteStatus(id: string) {
    await apiDelete(`/api/boards/statuses/${id}`);
  }

  async function deleteTask(id: string) {
    await apiDelete(`/api/boards/tasks/${id}`);
    if (selectedTask.value?.id === id) selectedTask.value = null;
    if (board.value) {
      board.value = {
        ...board.value,
        tasks: board.value.tasks.filter((t) => t.id !== id),
      };
    }
  }

  return {
    projects,
    modules,
    currentProject,
    currentModule,
    myTasks,
    board,
    projectTasks,
    selectedTask,
    tags,
    loading,
    error,
    dragging,
    fetchProjects,
    fetchModules,
    fetchMyTasks,
    fetchBoard,
    fetchProjectTasks,
    createProject,
    updateProject,
    createModule,
    createTask,
    moveTask,
    fetchTask,
    updateTask,
    addComment,
    fetchActivity,
    fetchTags,
    fetchAssignees,
    deleteProject,
    fetchProjectStatuses,
    createStatus,
    updateStatus,
    reorderStatuses,
    deleteStatus,
    deleteTask,
  };
});
