<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-2">
      <select
        v-if="allowedModels.length > 1"
        v-model="selectedModel"
        class="crm-input py-1 px-2 text-xs"
        :disabled="loading"
      >
        <option v-for="m in allowedModels" :key="m.id" :value="m.id">
          {{ m.label }}
        </option>
      </select>

      <input
        v-model="instruction"
        type="text"
        class="flex-1 crm-input py-1 px-2 text-xs min-w-0"
        :placeholder="t('mail.aiSuggest.instructionPlaceholder')"
        :disabled="loading"
        @keyup.enter="generate"
      />

      <button
        type="button"
        class="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"
        :disabled="loading"
        @click="generate"
      >
        <span>✨</span>
        <span>{{ loading ? t('mail.aiSuggest.generating') : t('mail.aiSuggest.generate') }}</span>
      </button>
    </div>

    <p v-if="error" class="text-xs text-danger">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGet, apiPost } from '../../api/client';

const props = defineProps<{
  /** Open thread for reply drafts; omit when drafting a first outbound from lead context. */
  threadId?: string;
  leadId?: string;
  onSuggest: (draft: string) => void;
}>();

const { t } = useI18n();

interface ModelEntry {
  id: string;
  label: string;
}

interface AllowedModelsResponse {
  models: ModelEntry[];
  defaultModel: string | null;
}

const allowedModels = ref<ModelEntry[]>([]);
const selectedModel = ref('');
const instruction = ref('');
const loading = ref(false);
const error = ref('');

async function loadModels() {
  try {
    const data = await apiGet<AllowedModelsResponse>('/api/plugins/ai-compose/models/allowed');
    const models = Array.isArray(data) ? data : (data.models ?? []);
    const defaultModel = Array.isArray(data) ? null : (data.defaultModel ?? null);
    allowedModels.value = models;
    if (models.length === 0) return;
    const preferred =
      defaultModel && models.some((m) => m.id === defaultModel) ? defaultModel : models[0].id;
    selectedModel.value = preferred;
  } catch {
    // silently ignore — button still works without model picker
  }
}

async function generate() {
  if (!props.threadId && !props.leadId) {
    error.value = t('mail.aiSuggest.error');
    return;
  }

  loading.value = true;
  error.value = '';
  try {
    const result = await apiPost<{ draft: string; modelUsed: string }>(
      '/api/plugins/ai-compose/suggest',
      {
        threadId: props.threadId,
        leadId: props.leadId,
        model: selectedModel.value || undefined,
        instruction: instruction.value.trim() || undefined,
      },
    );
    props.onSuggest(result.draft);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('mail.aiSuggest.error');
  } finally {
    loading.value = false;
  }
}

onMounted(loadModels);
</script>
