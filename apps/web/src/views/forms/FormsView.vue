<template>
  <div class="space-y-5">
    <PageActions>
      <RouterLink
        to="/forms/analytics"
        class="inline-flex h-8 items-center rounded-md bg-surface-raise px-3 text-sm text-text-secondary transition-colors hover:bg-surface-raise2"
      >
        {{ t('forms.list.analytics') }}
      </RouterLink>
    </PageActions>

    <h2 class="crm-page-title">{{ t('forms.list.title') }}</h2>

    <div v-if="error" class="crm-error">
      {{ error }}
    </div>
    <AppTable
      :loading="loading"
      :columns="columns"
      :rows="forms"
      :clickable="true"
      :has-actions="true"
      @row-click="(row) => goToForm((row as FormListItem).id)"
    >
      <template #empty>
        <EmptyState :title="t('forms.list.empty.title')" :message="t('forms.list.empty.message')">
          <template #action>
            <button class="btn-primary" @click="openCreateModal">
              <span aria-hidden="true">+</span> {{ t('forms.list.empty.action') }}
            </button>
          </template>
        </EmptyState>
      </template>
      <template #cell-kind="{ value }">
        <span
          class="inline-block px-2 py-0.5 text-xs rounded-md bg-surface-input text-text-secondary"
        >
          {{ kindLabel(value as FormKind) }}
        </span>
      </template>
      <template #cell-submissionCount="{ value }">
        <span class="text-sm text-text-secondary font-mono tabular-nums">{{
          n((value as number) ?? 0, 'integer')
        }}</span>
      </template>
      <template #cell-active="{ row }">
        <span
          class="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-md"
          :class="
            (row as FormListItem).active
              ? 'bg-success/15 text-success'
              : 'bg-surface-raise2 text-text-ghost'
          "
        >
          <span
            class="w-1.5 h-1.5 rounded-full"
            :class="(row as FormListItem).active ? 'bg-success' : 'bg-text-ghost'"
          ></span>
          {{
            (row as FormListItem).active
              ? t('forms.list.status.active')
              : t('forms.list.status.inactive')
          }}
        </span>
      </template>
      <template #cell-slug="{ value }">
        <code class="text-xs text-text-muted bg-surface-input px-1.5 py-0.5 rounded-md font-mono">{{
          value
        }}</code>
      </template>
      <template #actions="{ row }">
        <div class="flex items-center justify-end gap-2">
          <button
            class="btn-danger text-xs px-2 py-1"
            @click.stop="
              promptDelete({ id: (row as FormListItem).id, name: (row as FormListItem).name })
            "
          >
            {{ t('common.actions.delete') }}
          </button>
        </div>
      </template>
    </AppTable>

    <AppModal
      v-if="showCreateModal"
      :title="t('forms.list.create.title')"
      @close="showCreateModal = false"
    >
      <form @submit.prevent="createForm" class="space-y-3">
        <div>
          <label class="crm-label">{{ t('forms.list.create.template') }}</label>
          <AppSelect
            v-model="selectedTemplate"
            :options="templateOptions"
            :aria-label="t('forms.list.create.template')"
            trigger-class="w-full"
            @change="applyTemplate"
          />
        </div>
        <div>
          <label for="form-name" class="crm-label">
            {{ t('forms.list.create.name') }}
            <span class="text-text-ghost">
              <span aria-hidden="true">*</span
              ><span class="sr-only">{{ t('common.form.required') }}</span>
            </span>
          </label>
          <input
            id="form-name"
            v-model="newForm.name"
            type="text"
            required
            class="w-full crm-input focus:outline-none focus:border-accent"
            @input="syncSlugFromName"
          />
        </div>
        <div>
          <label for="form-slug" class="crm-label">
            {{ t('forms.list.create.slug') }}
            <span class="text-text-ghost">
              <span aria-hidden="true">*</span
              ><span class="sr-only">{{ t('common.form.required') }}</span>
            </span>
          </label>
          <input
            id="form-slug"
            v-model="newForm.slug"
            type="text"
            required
            pattern="[a-z0-9\-]+"
            :placeholder="t('forms.list.create.slugPlaceholder')"
            class="w-full crm-input focus:outline-none focus:border-accent"
            @input="slugTouched = true"
          />
          <p class="text-xs text-text-ghost mt-1">{{ t('forms.list.create.slugHint') }}</p>
        </div>
        <AppCheckbox v-model="newForm.active">{{ t('forms.list.create.active') }}</AppCheckbox>
        <div v-if="createError" class="text-sm text-danger">{{ createError }}</div>
        <div class="flex gap-2 pt-2">
          <button type="submit" :disabled="creating" class="btn-primary">
            {{ creating ? t('common.actions.creating') : t('common.actions.create') }}
          </button>
          <button type="button" class="btn-ghost" @click="showCreateModal = false">
            {{ t('common.actions.cancel') }}
          </button>
        </div>
      </form>
    </AppModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { FormKind, FormListItem } from '@khirby/types';
import { useFormsStore } from '../../stores/forms.store';
import { useToastStore } from '../../stores/toast.store';
import { useConfirm } from '../../composables/useConfirm';
import { FORM_TEMPLATE_OPTIONS, getTemplate, slugifyName } from '../../utils/form-field-templates';
import PageActions from '../../components/ui/PageActions.vue';
import AppTable from '../../components/AppTable.vue';
import AppModal from '../../components/AppModal.vue';
import AppSelect from '../../components/ui/AppSelect.vue';
import AppCheckbox from '../../components/ui/AppCheckbox.vue';
import EmptyState from '../../components/ui/EmptyState.vue';

const { t, n } = useI18n();
const route = useRoute();
const router = useRouter();
const formsStore = useFormsStore();
const toast = useToastStore();
const askConfirm = useConfirm();

/**
 * Computed, not a const: the templates carry a `labelKey`, and resolving it at
 * module scope would freeze every option at the boot locale
 * (`.claude/rules/i18n.md`).
 */
const templateOptions = computed(() =>
  FORM_TEMPLATE_OPTIONS.map((o) => ({ value: o.id, label: t(o.labelKey) })),
);

/** `form.kind` is a persisted enum — map the token to a label; `capitalize` is not localization. */
function kindLabel(kind: FormKind): string {
  return t(`forms.kind.${kind}`);
}

const forms = ref<FormListItem[]>([]);
const loading = ref(false);
const error = ref('');

const showCreateModal = ref(false);
const selectedTemplate = ref<FormKind>('contact');
const newForm = ref({
  name: '',
  slug: '',
  active: true,
  kind: 'contact' as FormKind,
  schema: getTemplate('contact').fields.map((f) => ({ ...f })),
});
const creating = ref(false);
const createError = ref('');
const slugTouched = ref(false);

const columns = computed(() => [
  { key: 'name', label: t('forms.list.columns.name') },
  { key: 'kind', label: t('forms.list.columns.kind') },
  { key: 'slug', label: t('forms.list.columns.slug') },
  { key: 'submissionCount', label: t('forms.list.columns.submissions') },
  { key: 'active', label: t('forms.list.columns.status') },
]);

onMounted(() => fetchForms());

/** Open the create dialog when arriving via the top-bar "+ New" (?new=1). */
watch(
  () => route.query.new,
  (v) => {
    if (v) {
      openCreateModal();
      router.replace({ query: { ...route.query, new: undefined } });
    }
  },
  { immediate: true },
);

async function fetchForms() {
  loading.value = true;
  error.value = '';
  try {
    await formsStore.fetchForms();
    forms.value = formsStore.forms;
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : t('forms.errors.loadList');
  } finally {
    loading.value = false;
  }
}

function openCreateModal() {
  selectedTemplate.value = 'contact';
  slugTouched.value = false;
  newForm.value = {
    name: '',
    slug: '',
    active: true,
    kind: 'contact',
    schema: getTemplate('contact').fields.map((f) => ({ ...f })),
  };
  createError.value = '';
  showCreateModal.value = true;
}

/**
 * The template's field labels are copied verbatim into `schema` and end up in the
 * database, rendered to the customer's site visitors — so they stay the English
 * seed from form-field-templates.ts (ADR-0011). Only the picker is localized.
 */
function applyTemplate() {
  const template = getTemplate(selectedTemplate.value);
  newForm.value.kind = template.kind;
  newForm.value.schema = template.fields.map((f) => ({ ...f }));
}

function syncSlugFromName() {
  if (!slugTouched.value) {
    newForm.value.slug = slugifyName(newForm.value.name);
  }
}

function goToForm(id: string) {
  router.push(`/forms/${id}`);
}

async function promptDelete(item: { id: string; name: string }) {
  const ok = await askConfirm({
    title: t('forms.list.delete.title'),
    message: t('forms.list.delete.message', { name: item.name }),
    confirmLabel: t('forms.list.delete.confirm'),
  });
  if (!ok) return;
  try {
    await formsStore.deleteForm(item.id);
    toast.success(t('forms.toast.deleted'));
    await fetchForms();
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : t('forms.errors.delete'));
  }
}

async function createForm() {
  createError.value = '';
  creating.value = true;
  try {
    const created = await formsStore.createForm({
      name: newForm.value.name,
      slug: newForm.value.slug,
      active: newForm.value.active,
      kind: newForm.value.kind,
      schema: newForm.value.schema,
    });
    showCreateModal.value = false;
    toast.success(t('forms.toast.created'));
    await fetchForms();
    router.push(`/forms/${created.id}`);
  } catch (e: unknown) {
    createError.value = e instanceof Error ? e.message : t('forms.errors.create');
  } finally {
    creating.value = false;
  }
}
</script>
