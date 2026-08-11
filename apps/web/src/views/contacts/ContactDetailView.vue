<template>
  <div class="space-y-6 max-w-5xl">
    <RouterLink to="/contacts" class="text-sm text-accent hover:text-accent transition-colors">
      <span aria-hidden="true">←</span> {{ t('contacts.detail.back') }}
    </RouterLink>

    <SkeletonRows v-if="loading" :rows="4" height="5rem" />
    <div v-else-if="error" class="crm-error">{{ error }}</div>

    <template v-else-if="contact">
      <div class="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <!-- Edit form -->
        <div class="crm-panel p-6 space-y-4 h-fit lg:sticky lg:top-4">
          <div>
            <h2 class="crm-page-title">{{ displayTitle }}</h2>
            <p class="text-sm text-text-muted mt-1">{{ t('contacts.detail.editHint') }}</p>
            <div v-if="formInterests.length" class="flex flex-wrap gap-2 mt-3">
              <span
                v-for="interest in formInterests"
                :key="interest"
                class="inline-block px-2 py-0.5 text-xs rounded-full bg-info/15 text-info border border-info/40"
              >
                {{ interest }}
              </span>
            </div>
          </div>

          <form class="space-y-3" @submit.prevent="saveContact">
            <div>
              <label for="contact-edit-email" class="crm-label">
                {{ t('contacts.detail.fields.email') }}
                <span class="text-text-ghost">
                  <span aria-hidden="true">*</span
                  ><span class="sr-only">{{ t('common.form.required') }}</span>
                </span>
              </label>
              <div class="relative">
                <input
                  id="contact-edit-email"
                  ref="emailInputRef"
                  v-model="form.email"
                  type="email"
                  required
                  class="crm-input w-full pr-10 disabled:opacity-50 disabled:cursor-not-allowed disabled:text-text-muted"
                  autocomplete="email"
                  :disabled="!emailUnlocked"
                  @input="saveError = null"
                />
                <AppTooltip
                  :label="
                    emailUnlocked
                      ? t('contacts.detail.lockEmail')
                      : t('contacts.detail.unlockEmail')
                  "
                  side="top"
                >
                  <button
                    type="button"
                    class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-text-ghost hover:text-text-secondary transition-colors"
                    :aria-label="
                      emailUnlocked
                        ? t('contacts.detail.lockEmail')
                        : t('contacts.detail.unlockEmail')
                    "
                    :aria-pressed="emailUnlocked"
                    @click="emailUnlocked ? lockEmail() : unlockEmail()"
                  >
                    <!-- Locked -->
                    <svg
                      v-if="!emailUnlocked"
                      class="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.75"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                    <!-- Unlocked -->
                    <svg
                      v-else
                      class="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.75"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V8a4 4 0 0 1 7.9-1" />
                    </svg>
                  </button>
                </AppTooltip>
              </div>
            </div>
            <div>
              <label for="contact-edit-name" class="crm-label">{{
                t('contacts.detail.fields.name')
              }}</label>
              <input
                id="contact-edit-name"
                v-model="form.name"
                type="text"
                class="crm-input"
                :placeholder="t('contacts.detail.namePlaceholder')"
                autocomplete="name"
                @input="saveError = null"
              />
            </div>
            <div>
              <label for="contact-edit-phone" class="crm-label">{{
                t('contacts.detail.fields.phone')
              }}</label>
              <input
                id="contact-edit-phone"
                v-model="form.phone"
                type="tel"
                class="crm-input"
                :placeholder="t('contacts.detail.phonePlaceholder')"
                autocomplete="tel"
                @input="saveError = null"
              />
            </div>

            <div v-if="saveError" class="crm-error">{{ saveError }}</div>
            <p v-if="saved" class="text-sm text-success">{{ t('common.actions.saved') }}</p>

            <div class="flex gap-2 pt-1">
              <button type="submit" class="btn-primary disabled:opacity-50" :disabled="saving">
                {{ saving ? t('common.actions.saving') : t('common.actions.save') }}
              </button>
              <button
                type="button"
                class="btn-ghost"
                :disabled="saving || !isDirty"
                @click="resetForm"
              >
                {{ t('common.actions.cancel') }}
              </button>
            </div>
          </form>

          <div v-if="hasCustomMetadata" class="pt-4 border-t border-border space-y-4">
            <div v-if="listmonkRows.length">
              <h3 class="text-xs font-medium text-text-ghost uppercase tracking-wider mb-2">
                {{ t('contacts.detail.newsletter') }}
              </h3>
              <RecordFields :rows="listmonkRows" />
            </div>
            <div v-if="otherMetadataRows.length">
              <h3 class="text-xs font-medium text-text-ghost uppercase tracking-wider mb-2">
                {{ t('contacts.detail.metadata') }}
              </h3>
              <RecordFields :rows="otherMetadataRows" />
            </div>
          </div>
        </div>

        <!-- Context summary -->
        <div class="space-y-6 min-w-0">
          <!-- Leads -->
          <div class="crm-panel overflow-hidden">
            <h3 class="px-6 pt-5 pb-3 text-sm font-semibold text-text-secondary">
              {{ t('contacts.detail.leads', { count: contactLeads.length }, contactLeads.length) }}
            </h3>
            <div v-if="contactLeads.length === 0" class="px-6 pb-5 text-text-ghost text-sm">
              {{ t('contacts.detail.noLeads') }}
            </div>
            <ul v-else class="divide-y divide-border">
              <li v-for="lead in contactLeads" :key="lead.id">
                <RouterLink
                  :to="{ path: '/pipeline', query: { lead: lead.id } }"
                  class="flex items-center justify-between gap-3 px-6 py-3 hover:bg-surface-input/60 transition-colors"
                >
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-text-primary truncate">{{ lead.title }}</p>
                    <p class="text-xs text-text-muted mt-0.5">
                      {{ lead.stageName || t('contacts.detail.unknownStage') }}
                      <span v-if="lead.formName"> · {{ lead.formName }}</span>
                    </p>
                  </div>
                  <span class="text-xs text-text-ghost shrink-0">{{
                    formatDate(lead.updatedAt)
                  }}</span>
                </RouterLink>
              </li>
            </ul>
          </div>

          <!-- Correspondence -->
          <div class="crm-panel overflow-hidden">
            <h3 class="px-6 pt-5 pb-0 text-sm font-semibold text-text-secondary">
              {{ t('mail.panel.correspondenceTitle') }}
            </h3>
            <MailThreadPanel :contact-id="contact.id" />
          </div>

          <!-- Submissions -->
          <div class="crm-panel overflow-hidden">
            <h3 class="px-6 pt-5 pb-3 text-sm font-semibold text-text-secondary">
              {{
                t('contacts.detail.submissions', { count: submissions.length }, submissions.length)
              }}
            </h3>
            <div v-if="submissions.length === 0" class="px-6 pb-5 text-text-ghost text-sm">
              {{ t('contacts.detail.noSubmissions') }}
            </div>
            <ul v-else class="divide-y divide-border">
              <li v-for="sub in submissions" :key="sub.id" class="px-6 py-4 space-y-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-text-primary">
                      {{ sub.formName ?? t('contacts.detail.formFallback', { id: sub.formId }) }}
                    </p>
                    <p v-if="sub.source?.referer" class="text-xs text-text-ghost mt-0.5 truncate">
                      {{ t('contacts.detail.source', { url: sub.source.referer }) }}
                    </p>
                  </div>
                  <span class="text-xs text-text-ghost shrink-0">{{
                    formatDate(sub.createdAt)
                  }}</span>
                </div>
                <RecordFields :rows="submissionRows(sub.data)" />
              </li>
            </ul>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGet, apiPatch, ApiError } from '../../api/client';
import SkeletonRows from '../../components/ui/SkeletonRows.vue';
import RecordFields from '../../components/ui/RecordFields.vue';
import AppTooltip from '../../components/ui/AppTooltip.vue';
import MailThreadPanel from '../../components/mail/MailThreadPanel.vue';
import { useConfirm } from '../../composables/useConfirm';
import { recordToFieldRows, type RecordFieldRow } from '../../utils/record-fields';

interface Submission {
  id: string;
  formId: string;
  formName?: string | null;
  createdAt: string;
  data?: Record<string, unknown>;
  source?: { referer?: string; userAgent?: string; ip?: string };
}

interface ContactLead {
  id: string;
  title: string;
  stageId: string;
  stageName: string | null;
  priority: string;
  value: string | null;
  formName: string | null;
  updatedAt: string;
}

interface Contact {
  id: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  metadata?: Record<string, unknown>;
  submissions?: Submission[];
  leads?: ContactLead[];
}

const { t, d } = useI18n();
const route = useRoute();
const askConfirm = useConfirm();
const contact = ref<Contact | null>(null);
const submissions = ref<Submission[]>([]);
const contactLeads = ref<ContactLead[]>([]);
const loading = ref(false);
const error = ref('');
const saving = ref(false);
const saved = ref(false);
const saveError = ref<string | null>(null);
const emailUnlocked = ref(false);
const emailInputRef = ref<HTMLInputElement | null>(null);

const form = ref({ email: '', name: '', phone: '' });

const displayTitle = computed(
  () => contact.value?.name?.trim() || contact.value?.email || t('contacts.detail.noName'),
);

const isDirty = computed(() => {
  if (!contact.value) return false;
  return (
    form.value.email !== contact.value.email ||
    form.value.name !== (contact.value.name ?? '') ||
    form.value.phone !== (contact.value.phone ?? '')
  );
});

const formInterests = computed(() => {
  const fromSubs = submissions.value
    .map((sub) => sub.formName)
    .filter((name): name is string => Boolean(name));
  if (fromSubs.length) return [...new Set(fromSubs)];

  const metaInterests = contact.value?.metadata?.interests;
  if (!Array.isArray(metaInterests)) return [];

  return [
    ...new Set(
      metaInterests
        .map((item) =>
          typeof item === 'object' && item !== null
            ? String((item as { formName?: string }).formName ?? '')
            : '',
        )
        .filter(Boolean),
    ),
  ];
});

const fieldFormatOpts = computed(() => ({
  formatDate: (iso: string) => formatDate(iso),
  formatBool: (value: boolean) =>
    value ? t('contacts.detail.bool.yes') : t('contacts.detail.bool.no'),
}));

const listmonkRows = computed((): RecordFieldRow[] => {
  const raw = contact.value?.metadata?.listmonk;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const data = raw as Record<string, unknown>;
  const rows: RecordFieldRow[] = [];
  if (typeof data.status === 'string' && data.status) {
    rows.push({
      key: 'status',
      label: t('contacts.detail.listmonk.status'),
      value:
        data.status === 'enabled'
          ? t('contacts.detail.listmonk.statusEnabled')
          : data.status === 'disabled'
            ? t('contacts.detail.listmonk.statusDisabled')
            : data.status,
    });
  }
  if (data.subscriberId != null && data.subscriberId !== '') {
    rows.push({
      key: 'subscriberId',
      label: t('contacts.detail.listmonk.subscriberId'),
      value: String(data.subscriberId),
    });
  }
  if (typeof data.syncedAt === 'string' && data.syncedAt) {
    rows.push({
      key: 'syncedAt',
      label: t('contacts.detail.listmonk.syncedAt'),
      value: formatDate(data.syncedAt),
    });
  }
  return rows;
});

const otherMetadataRows = computed(() => {
  const meta = { ...(contact.value?.metadata ?? {}) };
  delete meta.interests;
  delete meta.listmonk;
  return recordToFieldRows(meta, fieldFormatOpts.value);
});

const hasCustomMetadata = computed(
  () => listmonkRows.value.length > 0 || otherMetadataRows.value.length > 0,
);

function submissionRows(data?: Record<string, unknown>): RecordFieldRow[] {
  return recordToFieldRows(data, fieldFormatOpts.value);
}

onMounted(() => fetchContact());

async function fetchContact() {
  loading.value = true;
  error.value = '';
  try {
    const data = await apiGet<Contact>(`/api/contacts/${route.params.id}`);
    contact.value = data;
    submissions.value = data.submissions ?? [];
    contactLeads.value = data.leads ?? [];
    resetForm();
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : t('contacts.detail.errors.load');
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  if (!contact.value) return;
  form.value = {
    email: contact.value.email,
    name: contact.value.name ?? '',
    phone: contact.value.phone ?? '',
  };
  emailUnlocked.value = false;
  saveError.value = null;
  saved.value = false;
}

async function unlockEmail() {
  emailUnlocked.value = true;
  await nextTick();
  emailInputRef.value?.focus();
  emailInputRef.value?.select();
}

function lockEmail() {
  if (!contact.value) return;
  form.value.email = contact.value.email;
  emailUnlocked.value = false;
  saveError.value = null;
}

async function saveContact() {
  if (!contact.value) return;

  const nextEmail = form.value.email.trim();
  const emailChanged = nextEmail !== contact.value.email;

  if (emailChanged) {
    const confirmed = await askConfirm({
      title: t('contacts.detail.emailConfirm.title'),
      message: t('contacts.detail.emailConfirm.message', {
        from: contact.value.email,
        to: nextEmail,
      }),
      confirmLabel: t('contacts.detail.emailConfirm.confirm'),
      danger: true,
    });
    if (!confirmed) return;
  }

  saving.value = true;
  saveError.value = null;
  saved.value = false;
  try {
    const updated = await apiPatch<Contact>(`/api/contacts/${contact.value.id}`, {
      email: nextEmail,
      name: form.value.name.trim() || null,
      phone: form.value.phone.trim() || null,
    });
    contact.value = {
      ...contact.value,
      email: updated.email,
      name: updated.name,
      phone: updated.phone,
    };
    resetForm();
    saved.value = true;
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 409) {
      saveError.value = t('contacts.detail.errors.emailTaken');
    } else {
      saveError.value = e instanceof Error ? e.message : t('contacts.detail.errors.save');
    }
  } finally {
    saving.value = false;
  }
}

function formatDate(dateStr: string): string {
  return dateStr ? d(dateStr, 'dateTime') : '—';
}
</script>
