<template>
  <Teleport to="body">
    <Transition name="slide-over">
      <div v-if="open" class="fixed inset-0 z-40 flex justify-end">
        <div class="absolute inset-0 bg-black/60" @click="emit('close')" />
        <div
          ref="panelRef"
          class="lead-detail-panel relative w-full max-w-md bg-surface-panel border-l border-border h-full overflow-y-auto flex flex-col"
          role="dialog"
          aria-modal="true"
          :aria-label="t('pipeline.leadDetail.panelAria')"
        >
          <div v-if="loading" class="p-6 text-text-ghost text-sm">
            {{ t('common.state.loading') }}
          </div>

          <template v-else-if="lead">
            <div class="p-6 border-b border-border space-y-4">
              <div class="flex items-start justify-between gap-3">
                <h2 class="text-lg font-semibold text-text-primary flex-1 min-w-0 truncate">
                  {{ lead.title }}
                </h2>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    class="btn-danger text-xs px-2.5 py-1 disabled:opacity-50"
                    :disabled="deleting"
                    @click="promptDelete"
                  >
                    {{ t('common.actions.delete') }}
                  </button>
                  <button
                    class="text-text-muted hover:text-text-primary text-sm"
                    :aria-label="t('pipeline.leadDetail.closeAria')"
                    @click="emit('close')"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <RouterLink
                :to="`/contacts/${lead.contactId}`"
                class="text-sm text-accent hover:text-accent"
              >
                {{ lead.contactEmail }}
              </RouterLink>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs text-text-ghost mb-1">{{
                    t('pipeline.addLead.stage')
                  }}</label>
                  <AppSelect
                    :model-value="lead.stageId"
                    :options="stageOptions"
                    :aria-label="t('pipeline.addLead.stage')"
                    trigger-class="w-full py-1.5"
                    @change="onStageChange"
                  />
                </div>
                <div>
                  <label class="block text-xs text-text-ghost mb-1">{{
                    t('pipeline.addLead.priority')
                  }}</label>
                  <AppSelect
                    :model-value="lead.priority"
                    :options="priorityOptions"
                    :aria-label="t('pipeline.addLead.priority')"
                    trigger-class="w-full py-1.5"
                    @change="onPriorityChange"
                  />
                </div>
                <div>
                  <label class="block text-xs text-text-ghost mb-1">{{
                    t('pipeline.addLead.value')
                  }}</label>
                  <input
                    :value="editValue"
                    type="text"
                    inputmode="decimal"
                    class="w-full px-2 py-1.5 rounded bg-surface-input border border-border text-text-primary text-sm focus:outline-none focus:border-accent"
                    @input="onValueInput"
                  />
                </div>
                <div>
                  <label class="block text-xs text-text-ghost mb-1">{{
                    t('pipeline.addLead.owner')
                  }}</label>
                  <AppSelect
                    :model-value="lead.ownerId ?? ''"
                    :options="ownerOptions"
                    :aria-label="t('pipeline.addLead.owner')"
                    :placeholder="t('pipeline.owner.unassigned')"
                    trigger-class="w-full py-1.5"
                    @change="onOwnerChange"
                  />
                </div>
              </div>

              <div>
                <label class="block text-xs text-text-ghost mb-1">{{
                  t('pipeline.leadDetail.titleField')
                }}</label>
                <input
                  :value="editTitle"
                  type="text"
                  class="w-full px-2 py-1.5 rounded bg-surface-input border border-border text-text-primary text-sm focus:outline-none focus:border-accent"
                  @input="onTitleInput"
                />
              </div>
            </div>

            <div v-if="submissionFields.length" class="p-6 border-b border-border">
              <h3 class="text-xs font-medium text-text-ghost uppercase tracking-wider mb-3">
                {{ t('pipeline.leadDetail.formSubmission') }}
              </h3>
              <dl class="space-y-2">
                <div v-for="field in submissionFields" :key="field.key" class="text-sm">
                  <dt class="text-text-ghost text-xs">{{ field.label }}</dt>
                  <dd class="text-text-secondary">{{ field.value }}</dd>
                </div>
              </dl>
            </div>

            <!-- Correspondence (mail threads) — above internal notes -->
            <div class="border-b border-border">
              <h3
                class="px-6 pt-5 text-xs font-medium text-text-ghost uppercase tracking-wider mb-0"
              >
                {{ t('mail.panel.correspondenceTitle') }}
              </h3>
              <MailThreadPanel :lead-id="lead.id" :contact-id="lead.contactId" />
            </div>

            <div class="p-6 flex-1 flex flex-col">
              <h3 class="text-xs font-medium text-text-ghost uppercase tracking-wider mb-3">
                {{
                  t(
                    'pipeline.leadDetail.comments',
                    { count: lead.comments.length },
                    lead.comments.length,
                  )
                }}
              </h3>
              <div class="space-y-3 flex-1 mb-4">
                <div
                  v-for="comment in lead.comments"
                  :key="comment.id"
                  class="bg-surface-raise rounded-lg p-3"
                >
                  <p class="text-xs text-text-ghost mb-1">
                    {{ comment.userEmail ?? t('pipeline.leadDetail.unknownAuthor') }}
                    · {{ formatDate(comment.createdAt) }}
                  </p>
                  <p class="text-sm text-text-secondary whitespace-pre-wrap">{{ comment.body }}</p>
                </div>
                <p v-if="!lead.comments.length" class="text-sm text-text-ghost">
                  {{ t('pipeline.leadDetail.noComments') }}
                </p>
              </div>

              <form class="space-y-2" @submit.prevent="submitComment">
                <textarea
                  v-model="commentBody"
                  rows="3"
                  :placeholder="t('pipeline.leadDetail.commentPlaceholder')"
                  class="w-full px-3 py-2 rounded bg-surface-input border border-border text-text-primary text-sm focus:outline-none focus:border-accent resize-none"
                />
                <button
                  type="submit"
                  :disabled="!commentBody.trim() || commenting"
                  class="btn-primary disabled:opacity-50"
                >
                  {{
                    commenting
                      ? t('pipeline.leadDetail.addingComment')
                      : t('pipeline.leadDetail.addComment')
                  }}
                </button>
              </form>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import { useDebounceFn, onKeyStroke } from '@vueuse/core';
import type { PipelineStage, LeadAssignee } from '@khirby/types';
import { usePipelineStore } from '../../stores/pipeline.store';
import { useConfirm } from '../../composables/useConfirm';
import { useServerText } from '../../composables/useServerText';
import { useToastStore } from '../../stores/toast.store';
import AppSelect from '../ui/AppSelect.vue';
import MailThreadPanel from '../mail/MailThreadPanel.vue';

const props = defineProps<{
  open: boolean;
  leadId: string | null;
  stages: PipelineStage[];
  assignees: LeadAssignee[];
}>();

const stageOptions = computed(() =>
  props.stages.map((s) => ({ value: s.id, label: stageName(s) })),
);
const ownerOptions = computed(() => [
  { value: '', label: 'Unassigned' },
  ...props.assignees.map((a) => ({ value: a.id, label: a.email })),
]);
const priorityOptions = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { t, d } = useI18n();
const { stageName } = useServerText();
const askConfirm = useConfirm();
const toast = useToastStore();
const store = usePipelineStore();
const panelRef = ref<HTMLElement | null>(null);
const loading = ref(false);
const commenting = ref(false);
const commentBody = ref('');
const editTitle = ref('');
const editValue = ref('');
const deleting = ref(false);

const lead = computed(() => store.selectedLead);

const submissionFields = computed(() => {
  const data = lead.value?.submission?.data;
  if (!data) return [];
  return Object.entries(data)
    .filter(([key]) => key !== '_hp')
    .map(([key, value]) => ({
      key,
      // User-entered field name: not copy, so it is neither translated nor recased.
      label: key.replace(/_/g, ' '),
      value: String(value ?? ''),
    }));
});

watch(
  () => [props.open, props.leadId] as const,
  async ([open, id]) => {
    if (!open || !id) return;
    loading.value = true;
    try {
      await store.fetchLead(id);
      editTitle.value = store.selectedLead?.title ?? '';
      editValue.value = store.selectedLead?.value ?? '';
      await nextTick();
      panelRef.value?.querySelector<HTMLElement>('input, select, textarea')?.focus();
    } finally {
      loading.value = false;
    }
  },
);

watch(
  () => store.selectedLead?.title,
  (v) => {
    if (v !== undefined) editTitle.value = v;
  },
);
watch(
  () => store.selectedLead?.value,
  (v) => {
    editValue.value = v ?? '';
  },
);

onKeyStroke('Escape', () => {
  if (props.open) emit('close');
});

const debouncedUpdate = useDebounceFn(async (patch: Parameters<typeof store.updateLead>[1]) => {
  if (!props.leadId) return;
  await store.updateLead(props.leadId, patch);
}, 500);

function onTitleInput(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  editTitle.value = val;
  debouncedUpdate({ title: val });
}

function onValueInput(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  editValue.value = val;
  debouncedUpdate({ value: val || null });
}

function onStageChange(stageId: string) {
  if (!props.leadId) return;
  store.updateLead(props.leadId, { stageId });
}

function onPriorityChange(value: string) {
  if (!props.leadId) return;
  store.updateLead(props.leadId, { priority: value as 'low' | 'medium' | 'high' });
}

function onOwnerChange(val: string) {
  if (!props.leadId) return;
  store.updateLead(props.leadId, { ownerId: val || null });
}

async function submitComment() {
  if (!props.leadId || !commentBody.value.trim()) return;
  commenting.value = true;
  try {
    await store.addComment(props.leadId, commentBody.value.trim());
    commentBody.value = '';
  } finally {
    commenting.value = false;
  }
}

/**
 * useConfirm rather than a hand-rolled modal (.claude/rules/web.md §Components),
 * which also retires a delete sentence that was split across three DOM nodes.
 */
async function promptDelete() {
  if (!props.leadId || !lead.value) return;
  const confirmed = await askConfirm({
    title: t('pipeline.leadDetail.delete.title'),
    message: t('pipeline.leadDetail.delete.message', { name: lead.value.title }),
    confirmLabel: t('pipeline.leadDetail.deleteLead'),
  });
  if (!confirmed) return;

  deleting.value = true;
  try {
    await store.deleteLead(props.leadId);
    emit('close');
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : t('pipeline.leadDetail.errors.delete'));
  } finally {
    deleting.value = false;
  }
}

function formatDate(iso: string) {
  // toLocaleString() with no locale followed the browser, not the app.
  return d(iso, 'dateTime');
}
</script>

<style scoped>
/* Root must own a transition — Vue only waits for transitionend on the Transition root. */
.slide-over-enter-active,
.slide-over-leave-active {
  transition: opacity 0.25s ease;
}
.slide-over-enter-active :deep(.lead-detail-panel),
.slide-over-leave-active :deep(.lead-detail-panel) {
  transition: transform 0.25s ease;
}
.slide-over-enter-from,
.slide-over-leave-to {
  opacity: 0;
}
.slide-over-enter-from :deep(.lead-detail-panel),
.slide-over-leave-to :deep(.lead-detail-panel) {
  transform: translateX(100%);
}
</style>
