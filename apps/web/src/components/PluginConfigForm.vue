<template>
  <form class="max-w-lg space-y-4" @submit.prevent="handleSubmit">
    <div v-for="field in schema" :key="field.key">
      <label
        v-if="field.type !== 'api-multiselect' && field.type !== 'multiselect'"
        :for="fieldId(field.key)"
        class="block text-sm text-text-secondary mb-1"
      >
        {{ fieldLabel(field) }}
        <span v-if="field.required" class="text-text-ghost">*</span>
      </label>
      <p
        v-if="field.description && field.type !== 'api-multiselect' && field.type !== 'multiselect'"
        class="text-xs text-text-ghost mb-1.5"
      >
        {{ fieldDescription(field) }}
      </p>

      <div v-if="field.type === 'api-multiselect'" class="space-y-2">
        <p class="text-sm text-text-secondary mb-1">{{ fieldLabel(field) }}</p>
        <p v-if="field.description" class="text-xs text-text-ghost mb-2">
          {{ fieldDescription(field) }}
        </p>

        <p v-if="apiOptionsLoading[field.key]" class="text-xs text-text-ghost">
          {{ t('plugins.config.loadingLists') }}
        </p>
        <p v-else-if="apiOptionsError[field.key]" class="text-xs text-warning">
          {{ apiOptionsError[field.key] }}
        </p>
        <div
          v-else-if="(apiOptions[field.key] ?? []).length === 0"
          class="text-xs text-text-ghost italic"
        >
          {{ t('plugins.config.noLists') }}
        </div>
        <div v-else class="space-y-1.5 rounded-md border border-border bg-surface-raise p-3">
          <div
            v-for="opt in apiOptions[field.key]"
            :key="String(opt.id)"
            class="flex items-center gap-3 py-1"
          >
            <AppCheckbox
              :model-value="isSelected(field.key, String(opt.id))"
              :aria-label="opt.name"
              class="flex-1"
              @update:model-value="toggleSelection(field.key, String(opt.id))"
            >
              <span class="flex-1 text-sm text-text-secondary">{{ opt.name }}</span>
            </AppCheckbox>
            <span class="text-xs text-text-ghost tabular-nums">
              {{
                t(
                  'plugins.config.subscribers',
                  { count: n(subscriberCount(opt), 'integer') },
                  subscriberCount(opt),
                )
              }}
            </span>
          </div>
        </div>
      </div>

      <div v-else-if="field.type === 'multiselect'" class="space-y-2">
        <p class="text-sm text-text-secondary mb-1">
          {{ fieldLabel(field) }}
          <span v-if="field.required" class="text-text-ghost">*</span>
        </p>
        <p v-if="field.description" class="text-xs text-text-ghost mb-2">
          {{ fieldDescription(field) }}
        </p>
        <div class="space-y-1.5 rounded-md border border-border bg-surface-raise p-3">
          <div
            v-for="opt in field.options ?? []"
            :key="opt.value"
            class="flex items-center gap-3 py-1"
          >
            <AppCheckbox
              :model-value="isSelected(field.key, opt.value)"
              :aria-label="optionLabel(opt)"
              class="flex-1"
              @update:model-value="toggleSelection(field.key, opt.value)"
            >
              <span class="flex-1 text-sm text-text-secondary">{{ optionLabel(opt) }}</span>
            </AppCheckbox>
          </div>
        </div>
      </div>

      <AppSelect
        v-else-if="field.type === 'select'"
        v-model="values[field.key]"
        :options="selectOptions(field)"
        :aria-label="fieldLabel(field)"
        trigger-class="w-full"
      />

      <template v-else-if="field.type === 'textarea'">
        <textarea
          :id="fieldId(field.key)"
          v-model="values[field.key]"
          :placeholder="field.placeholder"
          :required="field.required"
          rows="4"
          class="w-full crm-input focus:outline-none focus:border-accent font-mono text-sm"
        />
        <div
          v-if="field.placeholders?.length"
          class="mt-2 rounded-md border border-border bg-surface-raise p-3"
        >
          <p class="text-xs text-text-secondary mb-2">
            {{ t('plugins.config.availableFields') }}
          </p>
          <ul class="space-y-1">
            <li
              v-for="ph in field.placeholders"
              :key="ph.token"
              class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs"
            >
              <code class="text-accent font-mono">{{ placeholderToken(ph.token) }}</code>
              <span class="text-text-ghost">{{ placeholderLabel(ph) }}</span>
            </li>
          </ul>
        </div>
      </template>

      <input
        v-else
        :id="fieldId(field.key)"
        v-model="values[field.key]"
        :type="field.type === 'password' ? 'password' : field.type === 'url' ? 'url' : 'text'"
        :placeholder="field.placeholder"
        :required="field.required"
        class="w-full crm-input focus:outline-none focus:border-accent"
      />
    </div>

    <div class="flex items-center gap-3 pt-1">
      <button type="submit" :disabled="saving" class="btn-primary">
        {{ saving ? t('common.actions.saving') : t('common.actions.save') }}
      </button>
      <span v-if="saved" class="text-xs text-success">
        <span aria-hidden="true">✓</span> {{ t('common.actions.saved') }}
      </span>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PluginConfigField } from '@khirby/types';
import { apiGet } from '../api/client';
import AppSelect from './ui/AppSelect.vue';
import AppCheckbox from './ui/AppCheckbox.vue';
import { useServerText } from '../composables/useServerText';

// Re-exported for consumers that used to import the shape from this component.
export type { PluginConfigField };

interface ApiListOption {
  id: number;
  name: string;
  subscriberCount?: number;
}

const { t, n } = useI18n();
// Field labels arrive from the backend as a stable key plus an English literal;
// the key wins where this bundle knows it, the literal otherwise (ADR-0011).
const { fieldLabel, fieldDescription, optionLabel, placeholderLabel } = useServerText();

const props = defineProps<{
  pluginName: string;
  schema: PluginConfigField[];
  config: Record<string, string>;
  saving?: boolean;
  saved?: boolean;
}>();

const emit = defineEmits<{
  save: [config: Record<string, string>];
}>();

const values = reactive<Record<string, string>>({});
const selectedSets = reactive<Record<string, Set<string>>>({});
const apiOptions = reactive<Record<string, ApiListOption[]>>({});
const apiOptionsLoading = reactive<Record<string, boolean>>({});
const apiOptionsError = reactive<Record<string, string>>({});

function fieldId(key: string): string {
  return `plugin-${props.pluginName}-${key}`;
}

function placeholderToken(token: string): string {
  return `{{${token}}}`;
}

/** AppSelect options with their labels resolved; the stored `value` is untouched. */
function selectOptions(field: PluginConfigField): { value: string; label: string }[] {
  return (field.options ?? []).map((o) => ({ value: o.value, label: optionLabel(o) }));
}

function parseSelectedIds(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function syncMultiselectValue(key: string): void {
  const ids = [...(selectedSets[key] ?? [])].sort((a, b) => a.localeCompare(b));
  values[key] = ids.join(',');
}

function isSelected(key: string, id: string): boolean {
  return selectedSets[key]?.has(id) ?? false;
}

function toggleSelection(key: string, id: string): void {
  const set = selectedSets[key] ?? new Set<string>();
  if (set.has(id)) set.delete(id);
  else set.add(id);
  selectedSets[key] = new Set(set);
  syncMultiselectValue(key);
}

/** Plural choice needs the raw number; n() formats it for display. */
function subscriberCount(opt: ApiListOption): number {
  return opt.subscriberCount ?? 0;
}

function initValues(config: Record<string, string>): void {
  for (const field of props.schema) {
    const existing = config[field.key];
    if (field.type === 'api-multiselect' || field.type === 'multiselect') {
      selectedSets[field.key] = parseSelectedIds(existing);
      values[field.key] = existing ?? '';
    } else if (existing !== undefined && existing !== '') {
      values[field.key] = existing;
    } else if (field.type === 'select' && field.options?.length) {
      values[field.key] = field.options[0].value;
    } else {
      values[field.key] = '';
    }
  }
}

async function loadApiOptions(field: PluginConfigField): Promise<void> {
  if (field.type !== 'api-multiselect' || !field.optionsUrl) return;

  apiOptionsLoading[field.key] = true;
  apiOptionsError[field.key] = '';
  try {
    apiOptions[field.key] = await apiGet<ApiListOption[]>(field.optionsUrl);
  } catch (e: unknown) {
    apiOptions[field.key] = [];
    apiOptionsError[field.key] = e instanceof Error ? e.message : t('plugins.config.loadFailed');
  } finally {
    apiOptionsLoading[field.key] = false;
  }
}

async function loadAllApiOptions(): Promise<void> {
  const fields = props.schema.filter((f) => f.type === 'api-multiselect');
  await Promise.all(fields.map((f) => loadApiOptions(f)));
}

watch(
  () => props.config,
  () => {
    initValues(props.config);
    loadAllApiOptions();
  },
  { immediate: true, deep: true },
);

function handleSubmit(): void {
  const config: Record<string, string> = {};
  for (const field of props.schema) {
    const value = values[field.key]?.trim() ?? '';
    if (value) config[field.key] = value;
  }
  emit('save', config);
}
</script>
