<template>
  <div class="space-y-5">
    <p v-if="!enabled" class="text-sm text-text-muted">
      {{ t('plugins.list.enableToConfigure') }}
    </p>

    <template v-else>
      <div v-if="loadError" class="crm-error">{{ loadError }}</div>

      <section class="space-y-4">
        <h3 class="text-sm font-medium text-text-primary">
          {{ t('plugins.aiCompose.provider.title') }}
        </h3>

        <div class="space-y-1">
          <label class="block text-sm text-text-secondary">
            {{ t('plugins.aiCompose.provider.baseUrl.label') }}
          </label>
          <input
            v-model="form.baseUrl"
            type="text"
            class="w-full crm-input"
            placeholder="https://api.openai.com/v1"
          />
          <p class="text-xs text-text-ghost">
            {{ t('plugins.aiCompose.provider.baseUrl.description') }}
          </p>
        </div>

        <div class="space-y-1">
          <label class="block text-sm text-text-secondary">
            {{ t('plugins.aiCompose.provider.apiKey.label') }}
          </label>
          <div class="flex items-center gap-2">
            <span
              v-if="settings?.apiKeyConfigured"
              class="text-xs px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/40"
            >
              {{ t('plugins.aiCompose.status.keyConfigured') }}
            </span>
            <span
              v-else
              class="text-xs px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/40"
            >
              {{ t('plugins.aiCompose.status.keyMissing') }}
            </span>
          </div>
          <input
            v-model="form.apiKey"
            type="password"
            class="w-full crm-input mt-1"
            :placeholder="t('plugins.aiCompose.provider.apiKey.placeholder')"
            autocomplete="off"
          />
          <p class="text-xs text-text-ghost">
            {{ t('plugins.aiCompose.provider.apiKey.description') }}
          </p>
        </div>

        <div v-if="saveError" class="crm-error">{{ saveError }}</div>
        <div v-if="savedOk" class="text-sm text-success">
          {{ t('plugins.aiCompose.status.saved') }}
        </div>

        <button
          type="button"
          class="btn-primary disabled:opacity-50"
          :disabled="saving"
          @click="saveProviderSettings"
        >
          {{
            saving
              ? t('plugins.aiCompose.provider.saving')
              : t('plugins.aiCompose.provider.saveButton')
          }}
        </button>
      </section>

      <section class="space-y-4 border-t border-border pt-4">
        <h3 class="text-sm font-medium text-text-primary">
          {{ t('plugins.aiCompose.models.title') }}
        </h3>

        <div class="space-y-1">
          <label class="block text-sm text-text-secondary">
            {{ t('plugins.aiCompose.models.allowList.label') }}
          </label>
          <p class="text-xs text-text-ghost">
            {{ t('plugins.aiCompose.models.allowList.description') }}
          </p>
          <div v-if="availableModels.length > 0" class="flex flex-wrap gap-2 mt-2">
            <button
              v-for="model in availableModels"
              :key="model.id"
              type="button"
              class="px-3 py-1 text-xs rounded-full border transition-colors"
              :class="
                form.allowedModels.includes(model.id)
                  ? 'bg-accent text-white border-accent'
                  : 'border-border text-text-secondary hover:border-accent'
              "
              @click="toggleModel(model.id)"
            >
              {{ model.label }}
            </button>
          </div>
          <p v-else class="text-sm text-text-ghost mt-2">
            <button
              type="button"
              class="text-accent hover:text-accent-hover underline"
              @click="fetchModels"
            >
              {{ t('plugins.aiCompose.models.fetchButton') }}
            </button>
          </p>
          <p v-if="fetchModelsError" class="crm-error mt-1">{{ fetchModelsError }}</p>
        </div>

        <div class="space-y-1">
          <label class="block text-sm text-text-secondary">
            {{ t('plugins.aiCompose.models.defaultModel.label') }}
          </label>
          <select v-model="form.defaultModel" class="w-full crm-input">
            <option value="">—</option>
            <option
              v-for="model in form.allowedModels.length
                ? form.allowedModels
                : availableModels.map((m) => m.id)"
              :key="model"
              :value="model"
            >
              {{ model }}
            </option>
          </select>
          <p class="text-xs text-text-ghost">
            {{ t('plugins.aiCompose.models.defaultModel.description') }}
          </p>
        </div>

        <button
          v-if="availableModels.length === 0"
          type="button"
          class="btn-ghost text-sm px-3 py-2 disabled:opacity-50"
          :disabled="fetchingModels"
          @click="fetchModels"
        >
          {{
            fetchingModels
              ? t('plugins.aiCompose.models.fetching')
              : t('plugins.aiCompose.models.fetchButton')
          }}
        </button>
      </section>

      <section class="space-y-3 border-t border-border pt-4">
        <h3 class="text-sm font-medium text-text-primary">
          {{ t('plugins.aiCompose.systemPrompt.title') }}
        </h3>
        <div class="space-y-1">
          <label class="block text-sm text-text-secondary">
            {{ t('plugins.aiCompose.systemPrompt.label') }}
          </label>
          <textarea
            ref="systemPromptEl"
            v-model="form.systemPrompt"
            rows="3"
            class="w-full crm-input resize-none overflow-hidden"
            @input="fitSystemPrompt"
          />
          <p class="text-xs text-text-ghost">
            {{ t('plugins.aiCompose.systemPrompt.description') }}
          </p>
        </div>
        <button
          type="button"
          class="btn-primary disabled:opacity-50"
          :disabled="saving"
          @click="saveAllSettings"
        >
          {{
            saving
              ? t('plugins.aiCompose.provider.saving')
              : t('plugins.aiCompose.provider.saveButton')
          }}
        </button>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGet, apiPatch } from '../../api/client';

interface AiComposeSettings {
  baseUrl: string;
  defaultModel: string | null;
  allowedModels: string[];
  systemPrompt: string | null;
  apiKeyConfigured: boolean;
}

interface ModelEntry {
  id: string;
  label: string;
}

const props = withDefaults(defineProps<{ enabled?: boolean }>(), { enabled: true });

const { t } = useI18n();

const loadError = ref('');
const saveError = ref('');
const savedOk = ref(false);
const saving = ref(false);
const fetchingModels = ref(false);
const fetchModelsError = ref('');
const systemPromptEl = ref<HTMLTextAreaElement | null>(null);

const settings = ref<AiComposeSettings | null>(null);
const availableModels = ref<ModelEntry[]>([]);

const form = ref({
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  defaultModel: '',
  allowedModels: [] as string[],
  systemPrompt: '',
});

/** Grow with content so the full prompt stays visible (same pattern as mail compose). */
function fitSystemPrompt() {
  const el = systemPromptEl.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function toggleModel(id: string) {
  const idx = form.value.allowedModels.indexOf(id);
  if (idx >= 0) {
    form.value.allowedModels.splice(idx, 1);
  } else {
    form.value.allowedModels.push(id);
  }
}

async function loadSettings() {
  if (!props.enabled) return;
  loadError.value = '';
  try {
    const data = await apiGet<AiComposeSettings>('/api/plugins/ai-compose/settings');
    settings.value = data;
    form.value.baseUrl = data.baseUrl;
    form.value.defaultModel = data.defaultModel ?? '';
    form.value.allowedModels = [...data.allowedModels];
    form.value.systemPrompt = data.systemPrompt ?? '';
    await nextTick();
    fitSystemPrompt();
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : t('plugins.aiCompose.errors.load');
  }
}

async function fetchModels() {
  fetchingModels.value = true;
  fetchModelsError.value = '';
  try {
    const data = await apiGet<ModelEntry[]>('/api/plugins/ai-compose/models');
    availableModels.value = data;
  } catch (e) {
    fetchModelsError.value =
      e instanceof Error ? e.message : t('plugins.aiCompose.errors.fetchModels');
  } finally {
    fetchingModels.value = false;
  }
}

async function saveProviderSettings() {
  await doSave({ apiKey: form.value.apiKey || undefined, baseUrl: form.value.baseUrl });
}

async function saveAllSettings() {
  await doSave({
    apiKey: form.value.apiKey || undefined,
    baseUrl: form.value.baseUrl,
    defaultModel: form.value.defaultModel || null,
    allowedModels: form.value.allowedModels,
    systemPrompt: form.value.systemPrompt || null,
  });
}

async function doSave(patch: Record<string, unknown>) {
  saving.value = true;
  saveError.value = '';
  savedOk.value = false;
  try {
    const updated = await apiPatch<AiComposeSettings>('/api/plugins/ai-compose/settings', patch);
    settings.value = updated;
    form.value.apiKey = '';
    savedOk.value = true;
    setTimeout(() => {
      savedOk.value = false;
    }, 3000);
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : t('plugins.aiCompose.errors.save');
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.enabled,
  (on) => {
    if (on) void loadSettings();
  },
);

onMounted(loadSettings);
</script>
