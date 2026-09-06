<template>
  <AppModal :title="t('contacts.list.import.title')" @close="emit('close')">
    <div class="space-y-4">
      <div v-if="!result">
        <label class="crm-label" :for="fileInputId">{{ t('contacts.list.import.pickFile') }}</label>
        <input
          :id="fileInputId"
          type="file"
          accept=".csv,text/csv"
          class="block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-surface-raise file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text-primary"
          @change="onFile"
        />
        <p v-if="parseError" class="text-sm text-danger mt-2">{{ parseError }}</p>
        <p v-else-if="headers.length" class="text-sm text-text-muted mt-2">
          {{ t('contacts.list.import.mappingHint') }}
        </p>
      </div>

      <div v-if="headers.length && !result" class="space-y-2">
        <div v-for="header in headers" :key="header" class="grid grid-cols-2 gap-2 items-center">
          <p class="text-sm text-text-primary truncate" :title="header">{{ header }}</p>
          <AppSelect
            :model-value="mapping[header] ?? ''"
            :options="destOptions"
            :aria-label="header"
            trigger-class="w-full !py-1.5"
            @update:model-value="(value) => setMapping(header, value)"
          />
        </div>
      </div>

      <p v-if="submitError" class="text-sm text-danger">{{ submitError }}</p>

      <div v-if="result" class="space-y-3">
        <h4 class="text-sm font-medium text-text-secondary">
          {{ t('contacts.list.import.resultTitle') }}
        </h4>
        <p class="text-sm text-text-primary">
          {{ t('contacts.list.import.imported', { count: result.imported }, result.imported) }}
        </p>
        <p class="text-sm text-text-primary">
          {{ t('contacts.list.import.skipped', { count: result.skipped }, result.skipped) }}
        </p>
        <div v-if="result.errors.length">
          <p class="text-sm font-medium text-text-secondary mb-1">
            {{ t('contacts.list.import.errorsTitle') }}
          </p>
          <ul class="max-h-40 overflow-y-auto space-y-1 text-sm text-danger">
            <li v-for="err in result.errors" :key="`${err.row}-${err.reason}`">
              {{
                t('contacts.list.import.errorRow', {
                  row: err.row,
                  reason: reasonLabel(err.reason),
                })
              }}
            </li>
          </ul>
        </div>
      </div>

      <div class="flex gap-2 pt-1">
        <button
          v-if="!result"
          type="button"
          class="btn-primary disabled:opacity-50"
          :disabled="!canSubmit || submitting"
          @click="submit"
        >
          {{ submitting ? t('contacts.list.import.submitting') : t('contacts.list.import.submit') }}
        </button>
        <button type="button" class="btn-ghost" @click="emit('close')">
          {{ t('contacts.list.import.close') }}
        </button>
      </div>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGet, apiPost, ApiError } from '../../api/client';
import AppModal from '../../components/AppModal.vue';
import AppSelect from '../../components/ui/AppSelect.vue';
import { parseCsv } from '../../utils/parse-csv';

type CustomFieldDefinition = {
  id: string;
  name: string;
  slug: string;
  type: string;
};

export type ImportSummary = {
  imported: number;
  skipped: number;
  errors: { row: number; reason: string }[];
};

const emit = defineEmits<{ close: []; imported: [] }>();

const { t } = useI18n();
const fileInputId = useId();
const headers = ref<string[]>([]);
const rows = ref<Record<string, string>[]>([]);
const mapping = ref<Record<string, string>>({});
const fields = ref<CustomFieldDefinition[]>([]);
const parseError = ref('');
const submitError = ref('');
const submitting = ref(false);
const result = ref<ImportSummary | null>(null);

const destOptions = computed(() => [
  { value: '', label: t('contacts.list.import.skipColumn') },
  { value: 'email', label: t('contacts.list.import.dest.email') },
  { value: 'name', label: t('contacts.list.import.dest.name') },
  { value: 'phone', label: t('contacts.list.import.dest.phone') },
  ...fields.value.map((f) => ({ value: f.slug, label: f.name })),
]);

const canSubmit = computed(
  () => headers.value.length > 0 && Object.values(mapping.value).includes('email'),
);

void loadFields();

async function loadFields() {
  try {
    fields.value = await apiGet<CustomFieldDefinition[]>('/api/custom-fields?entity=contact');
  } catch {
    fields.value = [];
  }
}

function guessDest(header: string): string {
  const n = header.trim().toLowerCase();
  if (n === 'email' || n === 'e-mail' || n === 'e_mail') return 'email';
  if (n === 'name' || n === 'imię' || n === 'imie') return 'name';
  if (n === 'phone' || n === 'telefon') return 'phone';
  const match = fields.value.find((f) => f.slug === n || f.name.toLowerCase() === n);
  return match?.slug ?? '';
}

async function onFile(event: Event) {
  parseError.value = '';
  submitError.value = '';
  result.value = null;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const text = await file.text();
  const parsed = parseCsv(text);
  if (!parsed.headers.length) {
    headers.value = [];
    rows.value = [];
    parseError.value = t('contacts.list.import.noHeaders');
    return;
  }
  headers.value = parsed.headers;
  rows.value = parsed.rows;
  const next: Record<string, string> = {};
  for (const header of parsed.headers) next[header] = guessDest(header);
  mapping.value = next;
}

function setMapping(header: string, value: string) {
  mapping.value = { ...mapping.value, [header]: value };
}

function reasonLabel(reason: string): string {
  const key = `contacts.list.import.reasons.${reason}`;
  const translated = t(key);
  return translated === key ? reason : translated;
}

async function submit() {
  submitError.value = '';
  if (!Object.values(mapping.value).includes('email')) {
    submitError.value = t('contacts.list.import.noEmail');
    return;
  }
  const inverted: Record<string, string> = {};
  for (const [header, dest] of Object.entries(mapping.value)) {
    if (dest) inverted[dest] = header;
  }
  submitting.value = true;
  try {
    result.value = await apiPost<ImportSummary>('/api/contacts/import', {
      mapping: inverted,
      rows: rows.value,
    });
    emit('imported');
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 413) {
      submitError.value = t('contacts.list.import.tooLarge');
    } else {
      submitError.value = e instanceof Error ? e.message : t('contacts.list.import.failed');
    }
  } finally {
    submitting.value = false;
  }
}
</script>
