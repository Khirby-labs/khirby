<template>
  <AppModal
    :title="isMailCapture ? t('mail.capture.title') : t('pipeline.addLead.title')"
    :description="isMailCapture ? t('mail.capture.hint') : undefined"
    @close="$emit('close')"
  >
    <form class="space-y-3" @submit.prevent="handleSubmit">
      <div
        v-if="isMailCapture && messageSnippet"
        class="rounded-lg border border-border bg-surface-raise/60 px-3 py-2"
      >
        <p class="mb-1 text-xs font-medium text-text-muted">{{ t('mail.capture.messageHint') }}</p>
        <p
          class="max-h-28 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-text-secondary"
        >
          {{ messageSnippet }}
        </p>
      </div>

      <!-- Mail capture: name first so dialog auto-focus lands on the editable field. -->
      <template v-if="isMailCapture">
        <div>
          <label class="crm-label">{{ t('pipeline.addLead.name') }}</label>
          <input v-model="form.name" type="text" class="crm-input" autocomplete="name" />
        </div>
        <div>
          <label class="crm-label">
            {{ t('pipeline.addLead.email') }}
            <span class="text-text-ghost">
              <span aria-hidden="true">*</span
              ><span class="sr-only">{{ t('common.form.required') }}</span>
            </span>
          </label>
          <input v-model="form.email" type="email" required class="crm-input font-mono" />
        </div>
      </template>
      <template v-else>
        <div>
          <label class="crm-label">
            {{ t('pipeline.addLead.email') }}
            <span class="text-text-ghost">
              <span aria-hidden="true">*</span
              ><span class="sr-only">{{ t('common.form.required') }}</span>
            </span>
          </label>
          <input v-model="form.email" type="email" required class="crm-input" />
        </div>
        <div>
          <label class="crm-label">{{ t('pipeline.addLead.name') }}</label>
          <input v-model="form.name" type="text" class="crm-input" />
        </div>
      </template>
      <div>
        <label class="crm-label">{{ t('pipeline.addLead.value') }}</label>
        <input v-model="form.value" type="text" inputmode="decimal" class="crm-input" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="crm-label">{{ t('pipeline.addLead.stage') }}</label>
          <AppSelect
            v-model="form.stageId"
            :options="stageOptions"
            :aria-label="t('pipeline.addLead.stage')"
            trigger-class="w-full"
          />
        </div>
        <div>
          <label class="crm-label">{{ t('pipeline.addLead.priority') }}</label>
          <AppSelect
            v-model="form.priority"
            :options="priorityOptions"
            :aria-label="t('pipeline.addLead.priority')"
            trigger-class="w-full"
          />
        </div>
      </div>
      <div>
        <label class="crm-label">{{ t('pipeline.addLead.owner') }}</label>
        <AppSelect
          v-model="form.ownerId"
          :options="ownerOptions"
          :aria-label="t('pipeline.addLead.owner')"
          :placeholder="t('pipeline.owner.unassigned')"
          trigger-class="w-full"
        />
      </div>
      <div v-if="error" class="crm-error">{{ error }}</div>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" class="btn-ghost" @click="$emit('close')">
          {{ t('common.actions.cancel') }}
        </button>
        <button type="submit" :disabled="saving" class="btn-primary disabled:opacity-50">
          {{
            saving
              ? t('common.actions.creating')
              : isMailCapture
                ? t('mail.capture.submit')
                : t('pipeline.addLead.submit')
          }}
        </button>
      </div>
    </form>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useServerText } from '../../composables/useServerText';
import AppModal from '../AppModal.vue';
import AppSelect from '../ui/AppSelect.vue';
import type { PipelineStage, LeadAssignee, LeadPriority } from '@khirby/types';
import { usePipelineStore } from '../../stores/pipeline.store';
import { useMailStore } from '../../stores/mail.store';

const props = defineProps<{
  stages: PipelineStage[];
  assignees: LeadAssignee[];
  defaultStageId?: string;
  /** Prefill when opened from mail (or elsewhere). */
  initialEmail?: string;
  initialName?: string;
  /**
   * When set, submit POSTs `/api/mail/threads/:id/capture-as-lead` instead of
   * `/api/leads`, linking the thread after create.
   */
  captureThreadId?: string;
  /** First inbound body snippet shown so the user can copy a name from the mail. */
  messageSnippet?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'created'): void;
}>();

const { t } = useI18n();
const { stageName } = useServerText();
const pipelineStore = usePipelineStore();
const mailStore = useMailStore();
const saving = ref(false);
const error = ref('');

const isMailCapture = computed(() => Boolean(props.captureThreadId));

const stageOptions = computed(() =>
  props.stages.map((s) => ({ value: s.id, label: stageName(s) })),
);
const ownerOptions = computed(() => [
  { value: '', label: t('pipeline.owner.unassigned') },
  ...props.assignees.map((a) => ({ value: a.id, label: a.email })),
]);
const priorityOptions = computed(() => [
  { value: 'low', label: t('pipeline.priority.low') },
  { value: 'medium', label: t('pipeline.priority.medium') },
  { value: 'high', label: t('pipeline.priority.high') },
]);

const form = ref({
  email: props.initialEmail ?? '',
  name: props.initialName ?? '',
  value: '',
  stageId: props.defaultStageId ?? props.stages[0]?.id ?? '',
  priority: 'medium' as LeadPriority,
  ownerId: '',
});

watch(
  () => props.defaultStageId,
  (id) => {
    if (id) form.value.stageId = id;
  },
);

watch(
  () => [props.initialEmail, props.initialName] as const,
  ([email, name]) => {
    if (email !== undefined) form.value.email = email;
    if (name !== undefined) form.value.name = name;
  },
);

async function handleSubmit() {
  saving.value = true;
  error.value = '';
  const payload = {
    email: form.value.email.trim(),
    name: form.value.name.trim() || undefined,
    value: form.value.value.trim() || undefined,
    stageId: form.value.stageId || undefined,
    priority: form.value.priority,
    ownerId: form.value.ownerId || undefined,
  };
  try {
    if (props.captureThreadId) {
      await mailStore.captureAsLead(props.captureThreadId, payload);
    } else {
      await pipelineStore.createLead(payload);
    }
    emit('created');
    emit('close');
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : t('pipeline.addLead.errors.create');
  } finally {
    saving.value = false;
  }
}
</script>
