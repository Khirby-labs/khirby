<template>
  <div class="space-y-6">
    <PageActions>
      <div v-if="form" class="flex items-center gap-3">
        <span v-if="isDirty" class="inline-flex items-center gap-1.5 text-xs text-warning">
          <span class="w-1.5 h-1.5 rounded-full bg-warning"></span>
          {{ t('forms.detail.unsavedChanges') }}
        </span>
        <button class="btn-primary" :disabled="saving" @click="saveForm">
          {{ saving ? t('common.actions.saving') : t('forms.detail.save') }}
        </button>
      </div>
    </PageActions>

    <SkeletonRows v-if="loading" :rows="4" height="5rem" />
    <div v-else-if="error" class="crm-error">{{ error }}</div>

    <template v-else-if="form">
      <div>
        <h2 class="crm-page-title">{{ form.name }}</h2>
        <p class="text-xs text-text-ghost mt-1">
          {{ t('forms.detail.endpointToken') }}
          <code class="bg-surface-input px-1.5 py-0.5 rounded-md text-text-muted font-mono">{{
            form.endpointToken
          }}</code>
        </p>
      </div>

      <div v-if="formError" class="crm-error">{{ formError }}</div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <!-- LEFT: editor -->
        <div class="space-y-6">
          <!-- General -->
          <div class="crm-panel p-6 space-y-4">
            <h3 class="text-sm font-semibold text-text-secondary">
              {{ t('forms.detail.general.title') }}
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label for="form-name" class="crm-label">{{
                  t('forms.detail.general.name')
                }}</label>
                <input id="form-name" v-model="form.name" class="crm-input" />
              </div>
              <div>
                <label for="form-slug" class="crm-label">{{
                  t('forms.detail.general.slug')
                }}</label>
                <input
                  id="form-slug"
                  v-model="form.slug"
                  pattern="[a-z0-9\-]+"
                  class="crm-input font-mono"
                />
                <p class="text-xs text-text-ghost mt-1">
                  {{ t('forms.detail.general.slugHint') }}
                </p>
              </div>
              <div>
                <label class="crm-label">{{ t('forms.detail.general.kind') }}</label>
                <AppSelect
                  v-model="form.kind"
                  :options="kindOptions"
                  :aria-label="t('forms.detail.general.kind')"
                  trigger-class="w-full"
                />
              </div>
            </div>
            <AppCheckbox v-model="form.active">{{ t('forms.detail.general.active') }}</AppCheckbox>
          </div>

          <!-- Schema fields (the hero) -->
          <div class="crm-panel p-6 space-y-4 ring-1 ring-accent/25">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-sm font-semibold text-text-primary">
                {{ t('forms.detail.schema.title') }}
              </h3>
              <div class="flex flex-wrap items-center gap-2">
                <AppSelect
                  v-model="templateToApply"
                  :options="templateApplyOptions"
                  :aria-label="t('forms.detail.schema.applyTemplate')"
                  :placeholder="t('forms.detail.schema.applyTemplatePlaceholder')"
                  trigger-class="py-1 text-xs"
                />
                <button
                  class="text-xs text-accent hover:text-accent"
                  :disabled="!templateToApply"
                  @click="applyTemplate"
                >
                  {{ t('forms.detail.schema.apply') }}
                </button>
                <button class="btn-primary text-xs px-2.5 py-1" @click="addField">
                  <span aria-hidden="true">+</span> {{ t('forms.detail.schema.addField') }}
                </button>
              </div>
            </div>

            <!--
              The only <i18n-t>-with-slot case in the app: "email" is a schema
              identifier inside a <code> element, mid-sentence. Flattening this into
              a plain t() would either drop the markup or split the sentence across
              DOM nodes, which no inflected language can reassemble.
            -->
            <i18n-t
              keypath="forms.detail.schema.emailHint"
              tag="p"
              class="text-xs text-text-ghost"
              scope="global"
            >
              <template #code>
                <!-- i18n-ignore: the schema identifier the server matches on, not copy -->
                <code class="bg-surface-input px-1 rounded-md font-mono">email</code>
              </template>
            </i18n-t>

            <EmptyState
              v-if="schema.length === 0"
              :title="t('forms.detail.schema.empty.title')"
              :message="t('forms.detail.schema.empty.message')"
            >
              <template #action>
                <button class="btn-primary" @click="addField">
                  <span aria-hidden="true">+</span> {{ t('forms.detail.schema.addField') }}
                </button>
              </template>
            </EmptyState>

            <div
              v-for="(field, idx) in schema"
              :key="field._uid"
              class="rounded-md border border-border bg-surface-input p-4 space-y-3"
            >
              <div class="flex items-center gap-2">
                <span class="text-text-ghost" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="9" cy="6" r="1.6" />
                    <circle cx="15" cy="6" r="1.6" />
                    <circle cx="9" cy="12" r="1.6" />
                    <circle cx="15" cy="12" r="1.6" />
                    <circle cx="9" cy="18" r="1.6" />
                    <circle cx="15" cy="18" r="1.6" />
                  </svg>
                </span>
                <span
                  class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent/15 text-accent text-xs font-mono"
                  >{{ idx + 1 }}</span
                >
                <span
                  class="text-xs text-text-secondary bg-surface-hover border border-border rounded px-2 py-0.5"
                  >{{ fieldTypeLabel(field.type) }}</span
                >
                <div class="ml-auto flex items-center gap-1">
                  <button
                    class="p-1 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-muted"
                    :disabled="idx === 0"
                    :aria-label="t('forms.detail.schema.moveUpAria', { position: idx + 1 })"
                    @click="moveField(idx, -1)"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="m18 15-6-6-6 6" />
                    </svg>
                  </button>
                  <button
                    class="p-1 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-muted"
                    :disabled="idx === schema.length - 1"
                    :aria-label="t('forms.detail.schema.moveDownAria', { position: idx + 1 })"
                    @click="moveField(idx, 1)"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  <button
                    class="text-danger hover:text-danger text-xs ml-1"
                    :aria-label="t('forms.detail.schema.removeAria', { position: idx + 1 })"
                    @click="removeField(idx)"
                  >
                    {{ t('forms.detail.schema.remove') }}
                  </button>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="crm-label">{{ t('forms.detail.schema.fieldName') }}</label>
                  <input
                    v-model="field.name"
                    type="text"
                    :placeholder="t('forms.detail.schema.fieldNamePlaceholder')"
                    class="crm-input font-mono"
                  />
                </div>
                <div>
                  <label class="crm-label">{{ t('forms.detail.schema.labelEn') }}</label>
                  <input
                    :value="field.labels?.en ?? field.label"
                    type="text"
                    :placeholder="t('forms.detail.schema.labelEnPlaceholder')"
                    class="crm-input"
                    @input="setLabelEn(field, ($event.target as HTMLInputElement).value)"
                  />
                </div>
                <div>
                  <label class="crm-label">{{ t('forms.detail.schema.labelPl') }}</label>
                  <input
                    :value="field.labels?.pl ?? ''"
                    type="text"
                    :placeholder="t('forms.detail.schema.labelPlPlaceholder')"
                    class="crm-input"
                    @input="setLabelPl(field, ($event.target as HTMLInputElement).value)"
                  />
                </div>
                <div>
                  <label class="crm-label">{{ t('forms.detail.schema.type') }}</label>
                  <AppSelect
                    v-model="field.type"
                    :options="fieldTypeOptions"
                    :aria-label="t('forms.detail.schema.type')"
                    trigger-class="w-full"
                  />
                </div>
                <div class="flex items-end pb-1.5">
                  <AppCheckbox v-model="field.required">{{
                    t('forms.detail.schema.required')
                  }}</AppCheckbox>
                </div>
              </div>
              <div v-if="field.type === 'select'">
                <label class="crm-label">{{ t('forms.detail.schema.options') }}</label>
                <input
                  :value="(field.options ?? []).join(', ')"
                  type="text"
                  :placeholder="t('forms.detail.schema.optionsPlaceholder')"
                  class="crm-input"
                  @input="setOptions(field, ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT: preview + integration -->
        <div class="space-y-6 lg:sticky lg:top-4">
          <FormPreview :name="form.name" :fields="previewFields" />
          <IntegrationPanel
            :submit-url="submitUrl"
            :example-json="exampleJson"
            :curl-example="curlExample"
            :sdk-install-hint="sdkInstallHint"
            :sdk-example="sdkExample"
            :codegen-example="codegenExample"
          />
        </div>
      </div>

      <!-- Submissions -->
      <div class="crm-panel p-6 space-y-4">
        <h3 class="text-sm font-semibold text-text-secondary">
          {{
            t(
              'forms.detail.submissions.title',
              { count: n(submissionsTotal, 'integer') },
              submissionsTotal,
            )
          }}
        </h3>

        <AppTable
          :loading="submissionsLoading"
          :columns="submissionColumns"
          :rows="submissions"
          :has-actions="true"
        >
          <template #empty>
            <EmptyState
              :title="t('forms.detail.submissions.empty.title')"
              :message="t('forms.detail.submissions.empty.message')"
            />
          </template>
          <template #cell-createdAt="{ value }">
            <span class="font-mono tabular-nums text-xs text-text-ghost">{{
              formatDate(value as string)
            }}</span>
          </template>
          <template #cell-contactEmail="{ value }">
            <span class="font-mono text-text-secondary">{{ value }}</span>
          </template>
          <template #cell-referer="{ row }">
            <span class="text-xs text-text-ghost truncate block max-w-[220px]">
              {{ (row as SubmissionWithContact).source?.referer || '—' }}
            </span>
          </template>
          <template #actions="{ row }">
            <RouterLink
              :to="`/contacts/${(row as SubmissionWithContact).contactId}`"
              class="text-accent hover:text-accent text-xs"
            >
              {{ t('forms.detail.submissions.viewContact') }}
            </RouterLink>
          </template>
        </AppTable>

        <div
          v-if="submissionsTotal > submissionsPageSize"
          class="flex items-center justify-between pt-1 text-xs text-text-muted"
        >
          <span class="font-mono tabular-nums">{{
            t('common.pagination.pageOf', {
              current: submissionsPage,
              total: submissionTotalPages,
            })
          }}</span>
          <div class="flex gap-2">
            <button
              class="btn-ghost text-xs px-2 py-1"
              :disabled="submissionsPage <= 1"
              @click="goToSubmissionsPage(submissionsPage - 1)"
            >
              {{ t('common.pagination.prev') }}
            </button>
            <button
              class="btn-ghost text-xs px-2 py-1"
              :disabled="submissionsPage >= submissionTotalPages"
              @click="goToSubmissionsPage(submissionsPage + 1)"
            >
              {{ t('common.pagination.next') }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { RouterLink, useRoute, onBeforeRouteLeave } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  type Form,
  type FormField,
  type FormKind,
  type SubmissionWithContact,
} from '@khirby/types';
import { useFormsStore } from '../../stores/forms.store';
import { useToastStore } from '../../stores/toast.store';
import { useConfirm } from '../../composables/useConfirm';
import {
  FORM_FIELD_TYPES,
  FORM_TEMPLATE_OPTIONS,
  getTemplate,
} from '../../utils/form-field-templates';
import {
  buildCodegenExample,
  buildCurlExample,
  buildExampleSubmitData,
  buildPublicSubmitUrl,
  buildSdkExample,
  buildSdkInstallHint,
  formatSubmitBodyJson,
} from '../../utils/public-submit-example';
import AppSelect from '../../components/ui/AppSelect.vue';
import AppCheckbox from '../../components/ui/AppCheckbox.vue';
import SkeletonRows from '../../components/ui/SkeletonRows.vue';
import EmptyState from '../../components/ui/EmptyState.vue';
import PageActions from '../../components/ui/PageActions.vue';
import AppTable from '../../components/AppTable.vue';
import FormPreview from '../../components/forms/FormPreview.vue';
import IntegrationPanel from '../../components/forms/IntegrationPanel.vue';

/** Editable field carries a stable client id so v-for keys survive reorder/remove. */
type EditableField = FormField & { _uid: number };

const SLUG_RE = /^[a-z0-9-]+$/;

/**
 * `validateBeforeSave()` returns one of these CODES, never a sentence: a
 * translated string thrown through validation plumbing gets re-displayed and
 * double-translated, and it makes the rule impossible to unit-test without the
 * i18n runtime (`.claude/rules/i18n.md`). Copy is resolved at the call site.
 */
type ValidationProblem =
  | { code: 'nameRequired' }
  | { code: 'slugFormat' }
  | { code: 'fieldNameRequired' }
  | { code: 'duplicateFieldName'; name: string }
  | { code: 'selectNeedsOptions'; name: string }
  | { code: 'emailFieldRequired' };

/** The schema identifier the server matches submissions on — an identifier, never copy. */
const EMAIL_FIELD = 'email';

let uidSeq = 0;
const nextUid = () => ++uidSeq;

/** Ensure builder state has `labels.en` / `labels.pl` even for legacy schemas (ADR-0025). */
function ensureFieldLabels(f: FormField): FormField {
  return {
    ...f,
    labels: {
      en: f.labels?.en ?? f.label ?? '',
      pl: f.labels?.pl ?? '',
    },
  };
}

const withUid = (fields: FormField[]): EditableField[] =>
  fields.map((f) => ({ ...ensureFieldLabels(f), _uid: nextUid() }));

/**
 * Persist EN as required `label`, keep optional `labels` (omit empty PL).
 * Never copy the operator UI locale into the seed — only what they typed.
 */
function stripUid(fields: EditableField[]): FormField[] {
  return fields.map((f) => {
    const { _uid, ...rest } = f;
    void _uid;
    const en = (rest.labels?.en ?? rest.label).trim();
    const pl = (rest.labels?.pl ?? '').trim();
    const out: FormField = {
      name: rest.name,
      label: en,
      type: rest.type,
      required: rest.required,
      labels: { en, ...(pl ? { pl } : {}) },
    };
    if (rest.options) out.options = rest.options;
    return out;
  });
}

function setLabelEn(field: EditableField, value: string) {
  field.labels = { en: value, pl: field.labels?.pl ?? '' };
  field.label = value;
}

function setLabelPl(field: EditableField, value: string) {
  field.labels = { en: field.labels?.en ?? field.label, pl: value };
}

const { t, d, n } = useI18n();
const route = useRoute();
const formsStore = useFormsStore();
const toast = useToastStore();
const askConfirm = useConfirm();

/**
 * All four label lists are computed: the templates and the field types carry
 * stable tokens, and resolving their labels at module scope would pin the whole
 * builder to the boot locale (`.claude/rules/i18n.md`).
 */
const kindOptions = computed(() =>
  FORM_TEMPLATE_OPTIONS.map((o) => ({ value: o.id, label: t(o.labelKey) })),
);
// Reka's SelectItem forbids an empty-string value — the "Apply template…" prompt is the
// AppSelect placeholder (shown while templateToApply is ''), not a selectable option.
const templateApplyOptions = computed(() =>
  FORM_TEMPLATE_OPTIONS.map((o) => ({ value: o.id, label: t(o.labelKey) })),
);
const fieldTypeOptions = computed(() =>
  FORM_FIELD_TYPES.map((type) => ({ value: type, label: fieldTypeLabel(type) })),
);

/** Field-type tokens are persisted — map the token to a label, never `capitalize` it. */
function fieldTypeLabel(type: string): string {
  return t(`forms.fieldType.${type}`);
}

const submissionColumns = computed(() => [
  { key: 'createdAt', label: t('forms.detail.submissions.columns.date') },
  { key: 'contactEmail', label: t('forms.detail.submissions.columns.contact') },
  { key: 'referer', label: t('forms.detail.submissions.columns.referer') },
]);

const form = ref<Form | null>(null);
const schema = ref<EditableField[]>([]);
const loading = ref(false);
const error = ref('');
const saving = ref(false);
const formError = ref('');
const templateToApply = ref<FormKind | ''>('');

/** Serialized snapshot of the last-persisted state — drives the dirty flag. */
const savedSnapshot = ref('');

const submissions = ref<SubmissionWithContact[]>([]);
const submissionsTotal = ref(0);
const submissionsLoading = ref(false);
const submissionsPage = ref(1);
const submissionsPageSize = 20;
const submissionTotalPages = computed(() =>
  Math.max(1, Math.ceil(submissionsTotal.value / submissionsPageSize)),
);

const previewFields = computed(() => stripUid(schema.value));

function serialize(): string {
  if (!form.value) return '';
  return JSON.stringify({
    name: form.value.name,
    slug: form.value.slug,
    kind: form.value.kind,
    active: form.value.active,
    schema: stripUid(schema.value),
  });
}

const isDirty = computed(() => savedSnapshot.value !== '' && serialize() !== savedSnapshot.value);

const submitUrl = computed(() => {
  if (!form.value) return '';
  const origin = import.meta.env?.VITE_API_URL || window.location.origin;
  return buildPublicSubmitUrl(origin, form.value.endpointToken);
});

const exampleJson = computed(() =>
  formatSubmitBodyJson(buildExampleSubmitData(previewFields.value)),
);

const curlExample = computed(() =>
  buildCurlExample(submitUrl.value, buildExampleSubmitData(previewFields.value)),
);

const apiOrigin = computed(() => import.meta.env?.VITE_API_URL || window.location.origin);

const sdkInstallHint = computed(() => buildSdkInstallHint());

const sdkExample = computed(() => {
  if (!form.value) return '';
  return buildSdkExample(apiOrigin.value, form.value.endpointToken, previewFields.value);
});

const codegenExample = computed(() => {
  if (!form.value) return '';
  return buildCodegenExample(apiOrigin.value, form.value.endpointToken);
});

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!isDirty.value) return;
  e.preventDefault();
  e.returnValue = '';
}

onMounted(async () => {
  window.addEventListener('beforeunload', onBeforeUnload);
  await fetchForm();
  await fetchSubmissions();
});

onUnmounted(() => window.removeEventListener('beforeunload', onBeforeUnload));

onBeforeRouteLeave(async () => {
  if (!isDirty.value) return true;
  return askConfirm({
    title: t('forms.detail.discard.title'),
    message: t('forms.detail.discard.message'),
    confirmLabel: t('forms.detail.discard.confirm'),
  });
});

async function fetchForm() {
  loading.value = true;
  error.value = '';
  try {
    const data = await formsStore.fetchForm(route.params.id as string);
    form.value = data;
    schema.value = withUid(data.schema ?? []);
    savedSnapshot.value = serialize();
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : t('forms.errors.load');
  } finally {
    loading.value = false;
  }
}

async function fetchSubmissions() {
  submissionsLoading.value = true;
  try {
    const result = await formsStore.fetchSubmissions(
      route.params.id as string,
      submissionsPage.value,
      submissionsPageSize,
    );
    submissions.value = result.data;
    submissionsTotal.value = result.total;
  } catch {
    submissions.value = [];
    submissionsTotal.value = 0;
  } finally {
    submissionsLoading.value = false;
  }
}

async function goToSubmissionsPage(page: number) {
  if (page < 1 || page > submissionTotalPages.value) return;
  submissionsPage.value = page;
  await fetchSubmissions();
}

function addField() {
  schema.value.push({
    name: '',
    label: '',
    labels: { en: '', pl: '' },
    type: 'text',
    required: false,
    _uid: nextUid(),
  });
}

function removeField(idx: number) {
  schema.value.splice(idx, 1);
}

function moveField(idx: number, dir: -1 | 1) {
  const j = idx + dir;
  if (j < 0 || j >= schema.value.length) return;
  const arr = schema.value;
  [arr[idx], arr[j]] = [arr[j], arr[idx]];
}

function setOptions(field: EditableField, raw: string) {
  field.options = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function applyTemplate() {
  if (!templateToApply.value || !form.value) return;
  if (
    schema.value.length > 0 &&
    !(await askConfirm({
      title: t('forms.detail.replaceFields.title'),
      message: t('forms.detail.replaceFields.message'),
      confirmLabel: t('forms.detail.replaceFields.confirm'),
    }))
  ) {
    return;
  }
  const template = getTemplate(templateToApply.value);
  form.value.kind = template.kind;
  // Template seeds stay English (`labels.en`); PL is empty for the operator
  // to author — never copy the CRM UI locale into visitor-facing data (ADR-0025).
  schema.value = withUid(template.fields);
  templateToApply.value = '';
}

/**
 * Client-side mirror of the server rules — block the save before it round-trips.
 * Returns a code, so it stays a pure unit; the sentence is built in `problemText`.
 */
function validateBeforeSave(): ValidationProblem | null {
  if (!form.value) return null;
  if (!form.value.name.trim()) return { code: 'nameRequired' };
  if (!SLUG_RE.test(form.value.slug)) return { code: 'slugFormat' };

  const names = schema.value.map((f) => f.name.trim());
  if (names.some((n) => n === '')) return { code: 'fieldNameRequired' };
  const dupe = names.find((n, i) => names.indexOf(n) !== i);
  if (dupe) return { code: 'duplicateFieldName', name: dupe };

  const selectMissingOptions = schema.value.find(
    (f) => f.type === 'select' && !(f.options && f.options.length > 0),
  );
  if (selectMissingOptions)
    return { code: 'selectNeedsOptions', name: selectMissingOptions.name.trim() };

  if (schema.value.length > 0) {
    const email = schema.value.find((f) => f.name.trim() === EMAIL_FIELD);
    if (!email || !email.required) return { code: 'emailFieldRequired' };
  }
  return null;
}

function problemText(problem: ValidationProblem): string {
  switch (problem.code) {
    case 'nameRequired':
      return t('forms.detail.validation.nameRequired');
    case 'slugFormat':
      return t('forms.detail.validation.slugFormat');
    case 'fieldNameRequired':
      return t('forms.detail.validation.fieldNameRequired');
    case 'duplicateFieldName':
      return t('forms.detail.validation.duplicateFieldName', { name: problem.name });
    case 'selectNeedsOptions':
      return t('forms.detail.validation.selectNeedsOptions', {
        name: problem.name || t('forms.detail.validation.unnamedField'),
      });
    case 'emailFieldRequired':
      // The token is a parameter, not part of the sentence: 'email' is the schema
      // identifier the server matches on and must never be translated.
      return t('forms.detail.validation.emailFieldRequired', { field: EMAIL_FIELD });
  }
}

async function saveForm() {
  if (!form.value) return;
  formError.value = '';

  const problem = validateBeforeSave();
  if (problem) {
    formError.value = problemText(problem);
    return;
  }

  saving.value = true;
  try {
    await formsStore.updateForm(form.value.id, {
      name: form.value.name,
      slug: form.value.slug,
      kind: form.value.kind,
      active: form.value.active,
      schema: stripUid(schema.value),
    });
    savedSnapshot.value = serialize();
    toast.success(t('forms.toast.saved'));
  } catch (e: unknown) {
    formError.value = e instanceof Error ? e.message : t('forms.errors.save');
    toast.error(t('forms.errors.save'));
  } finally {
    saving.value = false;
  }
}

function formatDate(dateStr: string): string {
  // Named format, no inline locale: this used to be toLocaleString('en-US', {…}),
  // which kept submission timestamps American whatever the UI language.
  return dateStr ? d(dateStr, 'dateTime') : '—';
}
</script>
