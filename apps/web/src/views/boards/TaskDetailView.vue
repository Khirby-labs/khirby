<template>
  <div class="mx-auto w-full max-w-6xl space-y-6">
    <div v-if="loading" class="space-y-3 p-1">
      <div class="h-4 w-48 bg-surface-raise animate-pulse rounded" />
      <div class="h-10 w-3/4 bg-surface-raise animate-pulse rounded" />
      <div class="h-40 bg-surface-raise animate-pulse rounded" />
    </div>

    <div v-else-if="error" class="crm-error">{{ error }}</div>

    <template v-else-if="task">
      <!-- Breadcrumb -->
      <nav class="flex flex-wrap items-center gap-1.5 text-xs text-text-ghost">
        <RouterLink :to="backTo" class="text-accent hover:text-accent-hover transition-colors">
          ← {{ t('boards.task.back') }}
        </RouterLink>
        <template v-if="task.project">
          <span>/</span>
          <RouterLink
            :to="{ name: 'boards-project', params: { projectId: task.project.id } }"
            class="hover:text-text-muted truncate max-w-[10rem]"
          >
            {{ task.project.name }}
          </RouterLink>
        </template>
        <template v-if="task.module">
          <span>/</span>
          <RouterLink
            :to="{ name: 'boards-module', params: { moduleId: task.module.id } }"
            class="hover:text-text-muted truncate max-w-[10rem]"
          >
            {{ task.module.name }}
          </RouterLink>
        </template>
        <button
          type="button"
          class="ml-auto text-danger hover:text-danger text-xs font-medium"
          @click="confirmDelete"
        >
          {{ t('boards.task.delete') }}
        </button>
      </nav>

      <p
        v-if="task.status?.isCanceled || canceledStatusSelected"
        class="rounded-md border border-border bg-surface-raise px-3 py-2 text-xs text-text-muted"
      >
        {{ t('boards.task.canceledHint') }}
      </p>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <!-- Main -->
        <div class="min-w-0 space-y-8 pb-8">
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <button
                v-if="task.identifier"
                type="button"
                class="font-mono text-sm font-semibold text-accent hover:text-accent-hover tracking-wide"
                :title="t('boards.task.copyId')"
                @click="copyIdentifier"
              >
                {{ task.identifier }}
              </button>
              <span v-if="copied" class="text-[11px] text-text-ghost">
                {{ t('boards.task.copied') }}
              </span>
            </div>
            <input
              v-model="editTitle"
              class="w-full text-2xl font-semibold text-text-primary bg-transparent border-b border-transparent focus:border-accent focus:outline-none pb-1 tracking-tight"
              :aria-label="t('boards.task.title')"
              @blur="saveTitle"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            />
          </div>

          <section class="space-y-2">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-text-ghost">
              {{ t('boards.task.description') }}
            </h3>
            <MarkdownEditor
              v-model="editDescription"
              :placeholder="t('boards.markdown.placeholder')"
              @save="saveDescription"
            />
          </section>

          <section class="space-y-3">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-text-ghost">
                {{ t('boards.task.subtasks') }}
              </h3>
              <button
                type="button"
                class="text-xs text-accent hover:text-accent-hover"
                @click="showSubtask = !showSubtask"
              >
                + {{ t('boards.task.addSubtask') }}
              </button>
            </div>
            <div v-if="showSubtask" class="flex gap-2">
              <input
                v-model="subtaskTitle"
                class="crm-input flex-1"
                :placeholder="t('boards.board.titlePlaceholder')"
                @keydown.enter="createSubtask"
              />
              <button type="button" class="btn-primary text-xs px-3" @click="createSubtask">
                {{ t('common.actions.save') }}
              </button>
            </div>
            <ul v-if="subtasks.length" class="space-y-1">
              <li v-for="st in subtasks" :key="st.id">
                <RouterLink
                  :to="boardsTaskLocation(st)"
                  class="flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-text-muted hover:bg-surface-raise hover:text-text-primary transition-colors"
                >
                  <span class="text-text-ghost">○</span>
                  <span class="truncate">{{ st.title }}</span>
                </RouterLink>
              </li>
            </ul>
            <p v-else class="text-sm text-text-ghost">{{ t('boards.task.noSubtasks') }}</p>
          </section>

          <section class="space-y-3">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-text-ghost">
              {{ t('boards.task.comments') }}
            </h3>
            <div v-if="!comments.length" class="text-sm text-text-ghost">
              {{ t('boards.task.noComments') }}
            </div>
            <div v-for="c in comments" :key="c.id" class="space-y-1 border-b border-border/40 pb-3">
              <p class="text-xs text-text-ghost">
                {{ c.userEmail ?? '—' }} · {{ d(new Date(c.createdAt), 'dateTime') }}
              </p>
              <div class="md-comment text-sm text-text-primary" v-html="renderMarkdown(c.body)" />
            </div>
            <div class="space-y-2">
              <textarea
                v-model="newComment"
                rows="3"
                class="crm-input font-mono text-sm"
                :placeholder="t('boards.task.commentPlaceholder')"
              />
              <div class="flex justify-end">
                <button
                  type="button"
                  class="btn-primary text-xs px-3"
                  :disabled="!newComment.trim() || commenting"
                  @click="submitComment"
                >
                  {{ t('boards.task.addComment') }}
                </button>
              </div>
            </div>
          </section>

          <section class="space-y-3">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-text-ghost">
              {{ t('boards.task.activity') }}
            </h3>
            <div v-if="!activity.length" class="text-sm text-text-ghost">
              {{ t('boards.task.noActivity') }}
            </div>
            <div v-for="a in activity" :key="a.id" class="text-xs text-text-ghost space-y-0.5">
              <p>
                <span class="text-text-muted">{{ a.userEmail ?? '—' }}</span>
                · {{ a.action }} · {{ d(new Date(a.createdAt), 'dateTime') }}
              </p>
            </div>
          </section>
        </div>

        <!-- Properties -->
        <aside class="h-fit space-y-4 self-start pb-8 lg:sticky lg:top-4">
          <div class="space-y-1.5">
            <label class="crm-label !mb-0">{{ t('boards.task.status') }}</label>
            <select v-model="editStatusId" class="crm-input" @change="saveStatus">
              <option v-for="s in statuses" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </div>

          <div class="space-y-1.5">
            <label class="crm-label !mb-0">{{ t('boards.task.priority') }}</label>
            <select v-model="editPriority" class="crm-input" @change="savePriority">
              <option value="low">{{ t('boards.priority.low') }}</option>
              <option value="medium">{{ t('boards.priority.medium') }}</option>
              <option value="high">{{ t('boards.priority.high') }}</option>
              <option value="urgent">{{ t('boards.priority.urgent') }}</option>
            </select>
          </div>

          <div class="space-y-1.5">
            <label class="crm-label !mb-0">{{ t('boards.task.dueDate') }}</label>
            <AppDatePicker
              :model-value="editDueDate"
              :aria-label="t('boards.task.dueDate')"
              clearable
              trigger-class="w-full py-2"
              @update:model-value="onDueDatePick"
            />
          </div>

          <div class="space-y-1.5">
            <label class="crm-label !mb-0">{{ t('boards.task.assignees') }}</label>
            <div v-if="!assigneeOptions.length" class="text-xs text-text-ghost py-1">
              {{ t('boards.task.noAssignees') }}
            </div>
            <div
              v-else
              class="space-y-1 max-h-48 overflow-y-auto rounded-md border border-border bg-surface-input p-2"
            >
              <AppCheckbox
                v-for="user in assigneeOptions"
                :key="user.id"
                :model-value="selectedAssigneeIds.includes(user.id)"
                :disabled="savingAssignees"
                :aria-label="user.email"
                class="w-full"
                @update:model-value="(on) => toggleAssignee(user.id, on)"
              >
                <span class="truncate text-text-primary">{{ user.email }}</span>
              </AppCheckbox>
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="crm-label !mb-0">{{ t('boards.task.lead') }}</label>
            <input
              v-model="editLeadId"
              class="crm-input"
              :placeholder="t('boards.task.leadPlaceholder')"
              @blur="saveLead"
            />
          </div>

          <div v-if="task.tags?.length" class="space-y-1.5">
            <p class="crm-label !mb-0">{{ t('boards.task.tags') }}</p>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="tag in task.tags"
                :key="tag.id"
                class="text-xs px-2 py-0.5 rounded"
                :style="{ backgroundColor: `${tag.color}22`, color: tag.color }"
              >
                {{ tag.name }}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  useBoardsStore,
  type TbAssignee,
  type TbStatus,
  type TbTask,
} from '../../stores/boards.store';
import { useToastStore } from '../../stores/toast.store';
import { useConfirm } from '../../composables/useConfirm';
import AppDatePicker from '../../components/ui/AppDatePicker.vue';
import AppCheckbox from '../../components/ui/AppCheckbox.vue';
import type { IsoDay } from '../../utils/date-range';
import { apiGet } from '../../api/client';
import { renderMarkdown } from '../../utils/markdown';
import { boardsTaskLocation, boardsTaskRef } from '../../utils/task-path';
import MarkdownEditor from './components/MarkdownEditor.vue';

const { t, d } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useBoardsStore();
const toast = useToastStore();
const askConfirm = useConfirm();

const taskId = computed(() => route.params.taskId as string);
const loading = ref(false);
const error = ref('');
const task = ref<TbTask | null>(null);
const statuses = ref<TbStatus[]>([]);
const assigneeOptions = ref<TbAssignee[]>([]);
const selectedAssigneeIds = ref<string[]>([]);
const savingAssignees = ref(false);
const subtasks = ref<TbTask[]>([]);
const comments = ref<
  Array<{ id: string; body: string; userEmail?: string | null; createdAt: string }>
>([]);
const activity = ref<
  Array<{ id: string; action: string; userEmail?: string | null; createdAt: string }>
>([]);

const editTitle = ref('');
const editStatusId = ref('');
const editPriority = ref<TbTask['priority']>('medium');
const editDueDate = ref<IsoDay | null>(null);
const editLeadId = ref('');
const editDescription = ref('');
const newComment = ref('');
const commenting = ref(false);
const showSubtask = ref(false);
const subtaskTitle = ref('');
const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

const backTo = computed(() => {
  if (task.value?.module?.id) {
    return { name: 'boards-module', params: { moduleId: task.value.module.id } };
  }
  if (task.value?.project?.id) {
    return { name: 'boards-project', params: { projectId: task.value.project.id } };
  }
  return { name: 'boards-my' };
});

const canceledStatusSelected = computed(() => {
  const s = statuses.value.find((x) => x.id === editStatusId.value);
  return !!s?.isCanceled;
});

async function confirmDelete() {
  if (!task.value) return;
  const confirmed = await askConfirm({
    title: t('boards.task.deleteConfirm.title'),
    message: t('boards.task.deleteConfirm.message', {
      title: task.value.title,
      id: task.value.identifier,
    }),
    confirmLabel: t('boards.task.deleteConfirm.confirm'),
  });
  if (!confirmed) return;
  try {
    const dest = backTo.value;
    await store.deleteTask(task.value.id);
    await router.push(dest);
  } catch {
    toast.error(t('boards.errors.deleteTask'));
  }
}

async function copyIdentifier() {
  if (!task.value?.identifier) return;
  try {
    await navigator.clipboard.writeText(task.value.identifier);
    copied.value = true;
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch {
    toast.error(t('boards.errors.save'));
  }
}

async function load() {
  if (!taskId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const [detail, users] = await Promise.all([
      store.fetchTask(taskId.value) as Promise<
        TbTask & {
          subtasks?: TbTask[];
          comments?: typeof comments.value;
        }
      >,
      store.fetchAssignees(),
    ]);
    task.value = detail;
    assigneeOptions.value = users;
    selectedAssigneeIds.value = (detail.assignees ?? []).map((a) => a.id);
    subtasks.value = detail.subtasks ?? [];
    comments.value = detail.comments ?? [];
    editTitle.value = detail.title;
    editStatusId.value = detail.statusId ?? '';
    editPriority.value = detail.priority;
    editDueDate.value = detail.dueDate ? (detail.dueDate.slice(0, 10) as IsoDay) : null;
    editLeadId.value = detail.leadId ?? '';
    editDescription.value = detail.description ?? '';
    activity.value = (await store.fetchActivity(detail.id)) as typeof activity.value;

    if (detail.moduleId) {
      statuses.value = await apiGet<TbStatus[]>(
        `/api/boards/statuses?moduleId=${encodeURIComponent(detail.moduleId)}`,
      );
    } else {
      statuses.value = [];
    }

    const canonical = boardsTaskRef(detail);
    if (taskId.value !== canonical) {
      await router.replace({ name: 'boards-task', params: { taskId: canonical } });
    }
  } catch {
    error.value = t('boards.errors.load');
    toast.error(t('boards.errors.load'));
  } finally {
    loading.value = false;
  }
}

async function toggleAssignee(userId: string, on: boolean) {
  if (!task.value) return;
  const next = on
    ? [...new Set([...selectedAssigneeIds.value, userId])]
    : selectedAssigneeIds.value.filter((id) => id !== userId);
  const prev = selectedAssigneeIds.value;
  selectedAssigneeIds.value = next;
  savingAssignees.value = true;
  try {
    const updated = await store.updateTask(task.value.id, { assigneeIds: next });
    task.value.assignees = updated.assignees ?? [];
    selectedAssigneeIds.value = (updated.assignees ?? []).map((a) => a.id);
  } catch {
    selectedAssigneeIds.value = prev;
    toast.error(t('boards.errors.save'));
  } finally {
    savingAssignees.value = false;
  }
}

async function saveTitle() {
  if (!task.value || editTitle.value.trim() === task.value.title) return;
  try {
    await store.updateTask(task.value.id, { title: editTitle.value.trim() });
    task.value.title = editTitle.value.trim();
    const canonical = boardsTaskRef(task.value);
    if (taskId.value !== canonical) {
      await router.replace({ name: 'boards-task', params: { taskId: canonical } });
    }
  } catch {
    toast.error(t('boards.errors.save'));
  }
}

async function saveStatus() {
  if (!task.value || editStatusId.value === task.value.statusId) return;
  try {
    await store.moveTask(task.value.id, editStatusId.value, task.value.position);
    task.value.statusId = editStatusId.value;
    const nextStatus = statuses.value.find((s) => s.id === editStatusId.value);
    if (nextStatus) {
      task.value.status = {
        id: nextStatus.id,
        name: nextStatus.name,
        color: nextStatus.color,
        isBacklog: nextStatus.isBacklog,
        isDone: nextStatus.isDone,
        isCanceled: nextStatus.isCanceled,
      };
    }
  } catch {
    toast.error(t('boards.errors.move'));
  }
}

async function savePriority() {
  if (!task.value || editPriority.value === task.value.priority) return;
  try {
    await store.updateTask(task.value.id, { priority: editPriority.value });
    task.value.priority = editPriority.value;
  } catch {
    toast.error(t('boards.errors.save'));
  }
}

async function onDueDatePick(day: IsoDay | null) {
  editDueDate.value = day;
  if (!task.value) return;
  const next = day ? new Date(`${day}T12:00:00.000Z`).toISOString() : null;
  const prev = task.value.dueDate ? task.value.dueDate.slice(0, 10) : null;
  if (day === prev) return;
  try {
    await store.updateTask(task.value.id, { dueDate: next });
    task.value.dueDate = next;
  } catch {
    toast.error(t('boards.errors.save'));
  }
}

async function saveLead() {
  if (!task.value) return;
  const next = editLeadId.value.trim() || null;
  if (next === task.value.leadId) return;
  try {
    await store.updateTask(task.value.id, { leadId: next });
    task.value.leadId = next;
  } catch {
    toast.error(t('boards.errors.save'));
  }
}

async function saveDescription(value: string) {
  if (!task.value) return;
  if ((value || null) === (task.value.description || null)) return;
  try {
    await store.updateTask(task.value.id, { description: value || null });
    task.value.description = value || null;
  } catch {
    toast.error(t('boards.errors.save'));
  }
}

async function submitComment() {
  if (!task.value || !newComment.value.trim()) return;
  commenting.value = true;
  try {
    await store.addComment(task.value.id, newComment.value.trim());
    newComment.value = '';
    await load();
  } catch {
    toast.error(t('boards.errors.save'));
  } finally {
    commenting.value = false;
  }
}

async function createSubtask() {
  const title = subtaskTitle.value.trim();
  if (!task.value || !title) return;
  try {
    await store.createTask({
      moduleId: task.value.moduleId,
      title,
      parentTaskId: task.value.id,
      statusId: task.value.statusId ?? undefined,
    });
    subtaskTitle.value = '';
    showSubtask.value = false;
    await load();
  } catch {
    toast.error(t('boards.errors.createTask'));
  }
}

watch(
  taskId,
  (next) => {
    if (task.value && boardsTaskRef(task.value) === next) return;
    void load();
  },
  { immediate: true },
);
</script>

<style scoped>
.md-comment :deep(p) {
  margin: 0.25em 0;
}
.md-comment :deep(code) {
  font-size: 0.85em;
  background: var(--surface-raise);
  border-radius: 0.25rem;
  padding: 0.05em 0.3em;
}
</style>
