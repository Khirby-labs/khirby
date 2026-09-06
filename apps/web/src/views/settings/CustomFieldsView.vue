<template>
  <div class="max-w-2xl space-y-6">
    <div class="flex items-start justify-between gap-3">
      <h3 class="text-sm font-medium text-text-secondary">
        {{ t('contacts.customFields.title') }}
      </h3>
      <button
        v-if="!showForm && fields.length"
        type="button"
        class="btn-primary text-sm"
        @click="openForm"
      >
        {{ t('contacts.customFields.add') }}
      </button>
    </div>

    <p v-if="error" class="crm-error">{{ error }}</p>

    <div v-if="loading" class="crm-panel p-5">
      <SkeletonRows :rows="3" />
    </div>

    <div v-else-if="!fields.length && !showForm" class="crm-panel">
      <EmptyState
        :title="t('contacts.customFields.emptyTitle')"
        :message="t('contacts.customFields.emptyMessage')"
      >
        <template #action>
          <button type="button" class="btn-primary" @click="openForm">
            {{ t('contacts.customFields.add') }}
          </button>
        </template>
      </EmptyState>
    </div>

    <ul v-else-if="fields.length" class="crm-panel divide-y divide-border overflow-hidden">
      <li
        v-for="field in fields"
        :key="field.id"
        class="flex items-center justify-between gap-3 px-5 py-3"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium text-text-primary truncate">{{ field.name }}</p>
          <p class="text-xs text-text-muted mt-0.5">
            {{ t(`contacts.customFields.types.${field.type}`) }}
          </p>
        </div>
        <button type="button" class="btn-danger text-xs px-2 py-1" @click="promptDelete(field)">
          {{ t('contacts.customFields.delete') }}
        </button>
      </li>
    </ul>

    <form v-if="showForm" class="crm-panel p-5 space-y-3" @submit.prevent="createField">
      <FormField :label="t('contacts.customFields.name')" required :error="formErrors.name">
        <template #default="{ fieldId, errorId, invalid }">
          <input
            :id="fieldId"
            v-model="form.name"
            type="text"
            required
            class="crm-input"
            :aria-invalid="invalid || undefined"
            :aria-describedby="errorId"
          />
        </template>
      </FormField>
      <FormField :label="t('contacts.customFields.type')" required>
        <template #default="{ fieldId }">
          <AppSelect
            :id="fieldId"
            :model-value="form.type"
            :options="typeOptions"
            trigger-class="w-full"
            @update:model-value="onTypeChange"
          />
        </template>
      </FormField>
      <FormField
        v-if="form.type === 'select'"
        :label="t('contacts.customFields.options')"
        required
        :hint="t('contacts.customFields.optionsHint')"
        :error="formErrors.options"
      >
        <template #default="{ fieldId, errorId, invalid }">
          <textarea
            :id="fieldId"
            v-model="form.optionsText"
            rows="4"
            class="crm-input min-h-[6rem]"
            :aria-invalid="invalid || undefined"
            :aria-describedby="errorId"
          />
        </template>
      </FormField>
      <p v-if="formError" class="text-sm text-danger">{{ formError }}</p>
      <div class="flex gap-2 pt-1">
        <button type="submit" class="btn-primary disabled:opacity-50" :disabled="creating">
          {{ creating ? t('contacts.customFields.creating') : t('contacts.customFields.create') }}
        </button>
        <button type="button" class="btn-ghost" @click="showForm = false">
          {{ t('contacts.customFields.cancel') }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiDelete, apiGet, apiPost, ApiError } from '../../api/client';
import EmptyState from '../../components/ui/EmptyState.vue';
import FormField from '../../components/ui/FormField.vue';
import AppSelect from '../../components/ui/AppSelect.vue';
import SkeletonRows from '../../components/ui/SkeletonRows.vue';
import { useConfirm } from '../../composables/useConfirm';

export type CustomFieldType = 'text' | 'number' | 'date' | 'select';

export interface CustomFieldDefinition {
  id: string;
  entity: 'contact';
  name: string;
  slug: string;
  type: CustomFieldType;
  options?: string[] | null;
}

const { t } = useI18n();
const askConfirm = useConfirm();

const fields = ref<CustomFieldDefinition[]>([]);
const loading = ref(false);
const error = ref('');
const showForm = ref(false);
const creating = ref(false);
const formError = ref('');
const formErrors = ref<{ name?: string; options?: string }>({});
const form = ref({ name: '', type: 'text' as CustomFieldType, optionsText: '' });

const typeOptions = computed(() =>
  (['text', 'number', 'date', 'select'] as const).map((type) => ({
    value: type,
    label: t(`contacts.customFields.types.${type}`),
  })),
);

onMounted(() => {
  void fetchFields();
});

async function fetchFields() {
  loading.value = true;
  error.value = '';
  try {
    fields.value = await apiGet<CustomFieldDefinition[]>('/api/custom-fields?entity=contact');
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : t('contacts.customFields.errors.load');
  } finally {
    loading.value = false;
  }
}

function openForm() {
  form.value = { name: '', type: 'text', optionsText: '' };
  formError.value = '';
  formErrors.value = {};
  showForm.value = true;
}

function onTypeChange(value: string) {
  form.value.type = value as CustomFieldType;
}

async function createField() {
  formError.value = '';
  formErrors.value = {};
  const name = form.value.name.trim();
  if (!name) return;

  let options: string[] | undefined;
  if (form.value.type === 'select') {
    options = form.value.optionsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!options.length) {
      formErrors.value = { options: t('contacts.customFields.errors.selectOptions') };
      return;
    }
  }

  creating.value = true;
  try {
    const created = await apiPost<CustomFieldDefinition>('/api/custom-fields', {
      entity: 'contact',
      name,
      type: form.value.type,
      options,
    });
    fields.value = [...fields.value, created];
    showForm.value = false;
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 409) {
      formError.value = t('contacts.customFields.errors.slugTaken');
    } else {
      formError.value = e instanceof Error ? e.message : t('contacts.customFields.errors.create');
    }
  } finally {
    creating.value = false;
  }
}

async function promptDelete(field: CustomFieldDefinition) {
  const confirmed = await askConfirm({
    title: t('contacts.customFields.deleteTitle'),
    message: t('contacts.customFields.deleteMessage', { name: field.name }),
    confirmLabel: t('contacts.customFields.deleteConfirm'),
    danger: true,
  });
  if (!confirmed) return;
  try {
    await apiDelete(`/api/custom-fields/${field.id}`);
    fields.value = fields.value.filter((f) => f.id !== field.id);
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : t('contacts.customFields.errors.delete');
  }
}
</script>
