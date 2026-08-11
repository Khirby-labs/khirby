<template>
  <div class="max-w-2xl space-y-6">
    <div>
      <h2 class="crm-page-title">{{ t('mail.settings.title') }}</h2>
      <p class="text-sm text-text-muted mt-1">{{ t('mail.settings.subtitle') }}</p>
    </div>

    <div v-if="store.mailboxLoading && !store.mailbox" class="text-sm text-text-ghost">
      {{ t('common.state.loading') }}
    </div>
    <div v-else-if="store.mailboxError" class="crm-error">{{ store.mailboxError }}</div>

    <div
      v-if="oauthFlash === 'ok'"
      class="crm-panel border-success p-4 text-sm text-success"
      role="status"
    >
      {{ t('mail.settings.google.connectedFlash') }}
    </div>
    <div v-else-if="oauthFlash === 'error'" class="crm-error text-sm" role="alert">
      {{ oauthFlashError || t('mail.settings.google.errorFlash') }}
    </div>

    <div
      v-if="!store.mailboxLoading || store.mailbox || store.googleOAuthConfigured"
      class="space-y-6"
    >
      <div
        v-if="!store.secretsKeyConfigured"
        class="crm-panel border-warning p-4 text-sm text-warning"
        role="alert"
      >
        {{ t('mail.settings.noSecretsKey') }}
      </div>

      <!-- Google OAuth -->
      <div v-if="store.googleOAuthConfigured" class="crm-panel p-5 space-y-3">
        <h3 class="text-sm font-medium text-text-secondary">
          {{ t('mail.settings.google.title') }}
        </h3>
        <p class="text-xs text-text-ghost">{{ t('mail.settings.google.hint') }}</p>
        <div v-if="isGoogleConnected" class="flex flex-wrap items-center gap-3">
          <span class="text-sm text-text-secondary">
            {{ t('mail.settings.google.connectedAs', { email: store.mailbox?.fromAddress ?? '' }) }}
          </span>
          <button
            type="button"
            class="btn-ghost px-3 py-1.5 text-sm"
            :disabled="store.mailboxLoading"
            @click="handleDisconnectGoogle"
          >
            {{ t('mail.settings.google.disconnect') }}
          </button>
        </div>
        <button
          v-else
          type="button"
          class="btn-primary"
          :disabled="!store.secretsKeyConfigured || store.mailboxLoading"
          @click="handleConnectGoogle"
        >
          {{ t('mail.settings.google.connect') }}
        </button>
      </div>

      <form class="space-y-6" novalidate @submit.prevent="handleSave">
        <!-- Enabled toggle -->
        <div class="crm-panel p-5 space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-sm font-medium text-text-secondary">
                {{ t('mail.settings.enabledLabel') }}
              </h3>
              <p class="text-xs text-text-ghost mt-0.5">{{ t('mail.settings.enabledHint') }}</p>
            </div>
            <button
              type="button"
              role="switch"
              :aria-checked="form.enabled"
              class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              :class="form.enabled ? 'bg-accent' : 'bg-surface-raise2'"
              @click="form.enabled = !form.enabled"
            >
              <span
                class="inline-block h-4 w-4 rounded-full bg-text-primary transition-transform"
                :class="form.enabled ? 'translate-x-6' : 'translate-x-1'"
              />
            </button>
          </div>

          <div v-if="store.mailbox" class="flex items-center gap-2 text-xs">
            <span class="inline-block h-2 w-2 rounded-full" :class="statusDotClass" />
            <span class="text-text-secondary">{{
              t(`mail.settings.status.${store.mailbox.connectionStatus}`)
            }}</span>
            <span v-if="store.mailbox.lastSyncAt" class="text-text-ghost">
              · {{ t('mail.settings.lastSync') }}: {{ d(store.mailbox.lastSyncAt, 'dateTime') }}
            </span>
          </div>
          <div v-if="store.mailbox?.lastSyncError" class="crm-error text-xs">
            {{ store.mailbox.lastSyncError }}
          </div>
        </div>

        <!-- Identity -->
        <div class="crm-panel p-5 space-y-4">
          <h3 class="text-sm font-medium text-text-secondary">
            {{ t('mail.settings.identity.title') }}
          </h3>
          <div class="grid grid-cols-2 gap-4">
            <FormField
              :label="t('mail.settings.identity.fromName')"
              required
              :error="errors.fromName"
            >
              <template #default="{ fieldId, errorId, invalid }">
                <input
                  :id="fieldId"
                  v-model="form.fromName"
                  type="text"
                  :aria-describedby="errorId"
                  :aria-invalid="invalid"
                  class="w-full crm-input"
                  @input="errors.fromName = ''"
                />
              </template>
            </FormField>
            <FormField
              :label="t('mail.settings.identity.fromAddress')"
              required
              :error="errors.fromAddress"
            >
              <template #default="{ fieldId, errorId, invalid }">
                <input
                  :id="fieldId"
                  v-model="form.fromAddress"
                  type="email"
                  :aria-describedby="errorId"
                  :aria-invalid="invalid"
                  class="w-full crm-input"
                  :readonly="isGoogleConnected"
                  :class="isGoogleConnected ? 'opacity-70' : ''"
                  @input="errors.fromAddress = ''"
                />
              </template>
            </FormField>
            <FormField
              :label="t('mail.settings.identity.name')"
              :error="errors.name"
              class="col-span-2"
            >
              <template #default="{ fieldId, errorId, invalid }">
                <input
                  :id="fieldId"
                  v-model="form.name"
                  type="text"
                  :aria-describedby="errorId"
                  :aria-invalid="invalid"
                  class="w-full crm-input"
                />
              </template>
            </FormField>
            <FormField
              :label="t('mail.settings.backfillDays')"
              :error="errors.backfillDays"
              class="col-span-2"
            >
              <template #default="{ fieldId, errorId, invalid }">
                <input
                  :id="fieldId"
                  v-model.number="form.backfillDays"
                  type="number"
                  min="1"
                  max="365"
                  :aria-describedby="errorId"
                  :aria-invalid="invalid"
                  class="w-full crm-input"
                />
              </template>
            </FormField>
          </div>
        </div>

        <!-- IMAP / SMTP — hidden when Google OAuth is connected -->
        <template v-if="!isGoogleConnected">
          <div class="crm-panel p-5 space-y-4">
            <h3 class="text-sm font-medium text-text-secondary">
              {{ t('mail.settings.imap.title') }}
            </h3>
            <div class="grid grid-cols-2 gap-4">
              <FormField :label="t('mail.settings.imap.host')" required :error="errors.imapHost">
                <template #default="{ fieldId, errorId, invalid }">
                  <input
                    :id="fieldId"
                    v-model="form.imapHost"
                    type="text"
                    :placeholder="t('mail.settings.imap.hostPlaceholder')"
                    :aria-describedby="errorId"
                    :aria-invalid="invalid"
                    class="w-full crm-input"
                    @input="errors.imapHost = ''"
                  />
                </template>
              </FormField>
              <FormField :label="t('mail.settings.imap.port')" required :error="errors.imapPort">
                <template #default="{ fieldId, errorId, invalid }">
                  <input
                    :id="fieldId"
                    v-model.number="form.imapPort"
                    type="number"
                    :aria-describedby="errorId"
                    :aria-invalid="invalid"
                    class="w-full crm-input"
                  />
                </template>
              </FormField>
              <FormField :label="t('mail.settings.imap.user')" required :error="errors.imapUser">
                <template #default="{ fieldId, errorId, invalid }">
                  <input
                    :id="fieldId"
                    v-model="form.imapUser"
                    type="text"
                    :aria-describedby="errorId"
                    :aria-invalid="invalid"
                    class="w-full crm-input"
                    @input="errors.imapUser = ''"
                  />
                </template>
              </FormField>
              <FormField
                :label="t('mail.settings.imap.password')"
                :hint="store.mailbox?.hasImapPassword ? t('mail.settings.passwordHint') : ''"
                :error="errors.imapPassword"
              >
                <template #default="{ fieldId, errorId, invalid }">
                  <input
                    :id="fieldId"
                    v-model="form.imapPassword"
                    type="password"
                    :placeholder="store.mailbox?.hasImapPassword ? '••••••••' : ''"
                    :aria-describedby="errorId"
                    :aria-invalid="invalid"
                    class="w-full crm-input"
                    autocomplete="new-password"
                  />
                </template>
              </FormField>
            </div>
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <input
                  id="imap-secure"
                  v-model="form.imapSecure"
                  type="checkbox"
                  class="crm-checkbox"
                />
                <label for="imap-secure" class="text-sm text-text-secondary">
                  {{ t('mail.settings.imap.secure') }}
                </label>
              </div>
              <p class="text-xs text-text-ghost pl-6">{{ t('mail.settings.imap.secureHint') }}</p>
            </div>
          </div>

          <div class="crm-panel p-5 space-y-4">
            <h3 class="text-sm font-medium text-text-secondary">
              {{ t('mail.settings.smtp.title') }}
            </h3>
            <div class="grid grid-cols-2 gap-4">
              <FormField :label="t('mail.settings.smtp.host')" required :error="errors.smtpHost">
                <template #default="{ fieldId, errorId, invalid }">
                  <input
                    :id="fieldId"
                    v-model="form.smtpHost"
                    type="text"
                    :placeholder="t('mail.settings.smtp.hostPlaceholder')"
                    :aria-describedby="errorId"
                    :aria-invalid="invalid"
                    class="w-full crm-input"
                    @input="errors.smtpHost = ''"
                  />
                </template>
              </FormField>
              <FormField :label="t('mail.settings.smtp.port')" required :error="errors.smtpPort">
                <template #default="{ fieldId, errorId, invalid }">
                  <input
                    :id="fieldId"
                    v-model.number="form.smtpPort"
                    type="number"
                    :aria-describedby="errorId"
                    :aria-invalid="invalid"
                    class="w-full crm-input"
                  />
                </template>
              </FormField>
              <FormField :label="t('mail.settings.smtp.user')" required :error="errors.smtpUser">
                <template #default="{ fieldId, errorId, invalid }">
                  <input
                    :id="fieldId"
                    v-model="form.smtpUser"
                    type="text"
                    :aria-describedby="errorId"
                    :aria-invalid="invalid"
                    class="w-full crm-input"
                    @input="errors.smtpUser = ''"
                  />
                </template>
              </FormField>
              <FormField
                :label="t('mail.settings.smtp.password')"
                :hint="store.mailbox?.hasSmtpPassword ? t('mail.settings.passwordHint') : ''"
                :error="errors.smtpPassword"
              >
                <template #default="{ fieldId, errorId, invalid }">
                  <input
                    :id="fieldId"
                    v-model="form.smtpPassword"
                    type="password"
                    :placeholder="store.mailbox?.hasSmtpPassword ? '••••••••' : ''"
                    :aria-describedby="errorId"
                    :aria-invalid="invalid"
                    class="w-full crm-input"
                    autocomplete="new-password"
                  />
                </template>
              </FormField>
            </div>
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <input
                  id="smtp-secure"
                  v-model="form.smtpSecure"
                  type="checkbox"
                  class="crm-checkbox"
                />
                <label for="smtp-secure" class="text-sm text-text-secondary">
                  {{ t('mail.settings.smtp.secure') }}
                </label>
              </div>
              <p class="text-xs text-text-ghost pl-6">{{ t('mail.settings.smtp.secureHint') }}</p>
            </div>
          </div>
        </template>

        <div v-else class="crm-panel p-5 text-sm text-text-muted">
          {{ t('mail.settings.google.hostsManaged') }}
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-3 flex-wrap">
          <button type="submit" :disabled="store.mailboxLoading" class="btn-primary">
            {{ store.mailboxLoading ? t('common.actions.saving') : t('common.actions.save') }}
          </button>
          <button
            type="button"
            :disabled="store.testStatus === 'testing' || !store.mailbox"
            class="btn-ghost px-4 py-2"
            @click="handleTest"
          >
            {{
              store.testStatus === 'testing'
                ? t('mail.settings.testing')
                : t('mail.settings.testConnection')
            }}
          </button>
          <span v-if="store.testStatus === 'ok'" class="text-xs text-success">
            <span aria-hidden="true">✓</span> {{ t('mail.settings.testOk') }}
          </span>
          <span v-else-if="store.testStatus === 'error'" class="text-xs text-error">
            {{ store.testError || t('mail.settings.testFailed') }}
          </span>
          <span v-if="saved" class="text-xs text-success">
            <span aria-hidden="true">✓</span> {{ t('common.actions.saved') }}
          </span>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useMailStore } from '../../stores/mail.store';
import FormField from '../../components/ui/FormField.vue';

const { t, d } = useI18n();
const store = useMailStore();
const route = useRoute();
const router = useRouter();

const saved = ref(false);
const oauthFlash = ref<'ok' | 'error' | null>(null);
const oauthFlashError = ref('');

const form = reactive({
  name: '',
  fromName: '',
  fromAddress: '',
  imapHost: '',
  imapPort: 993,
  imapSecure: true,
  imapUser: '',
  imapPassword: '',
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPassword: '',
  enabled: false,
  backfillDays: 30,
});

const errors = reactive({
  fromName: '',
  fromAddress: '',
  name: '',
  imapHost: '',
  imapPort: '',
  imapUser: '',
  imapPassword: '',
  smtpHost: '',
  smtpPort: '',
  smtpUser: '',
  smtpPassword: '',
  backfillDays: '',
});

const isGoogleConnected = computed(
  () => store.mailbox?.authMethod === 'google_oauth' && !!store.mailbox.hasOauthToken,
);

const statusDotClass = computed(() => {
  const s = store.mailbox?.connectionStatus;
  if (s === 'connected') return 'bg-success';
  if (s === 'reconnecting') return 'bg-warning';
  if (s === 'error') return 'bg-error';
  return 'bg-text-ghost';
});

function populateForm() {
  const m = store.mailbox;
  if (!m) return;
  form.name = m.name;
  form.fromName = m.fromName;
  form.fromAddress = m.fromAddress;
  form.imapHost = m.imapHost;
  form.imapPort = m.imapPort;
  form.imapSecure = m.imapSecure;
  form.imapUser = m.imapUser;
  form.smtpHost = m.smtpHost;
  form.smtpPort = m.smtpPort;
  form.smtpSecure = m.smtpSecure;
  form.smtpUser = m.smtpUser;
  form.enabled = m.enabled;
  form.backfillDays = m.backfillDays;
}

watch(() => store.mailbox, populateForm);

watch(
  () => form.imapPort,
  (port) => {
    if (port === 993) form.imapSecure = true;
    else if (port === 143) form.imapSecure = false;
  },
);
watch(
  () => form.smtpPort,
  (port) => {
    if (port === 465) form.smtpSecure = true;
    else if (port === 587 || port === 25 || port === 2525) form.smtpSecure = false;
  },
);

onMounted(async () => {
  const oauth = route.query.oauth;
  if (oauth === 'ok' || oauth === 'error') {
    oauthFlash.value = oauth;
    oauthFlashError.value =
      typeof route.query.oauthError === 'string' ? route.query.oauthError : '';
    await router.replace({ path: route.path, query: {} });
  }

  await store.fetchMailbox();
  if (!store.mailbox) {
    form.imapPort = 993;
    form.smtpPort = 587;
  }
});

function validate(): boolean {
  errors.fromName = form.fromName.trim() ? '' : t('mail.settings.errors.required');
  errors.fromAddress = form.fromAddress.trim() ? '' : t('mail.settings.errors.required');
  if (!isGoogleConnected.value) {
    errors.imapHost = form.imapHost.trim() ? '' : t('mail.settings.errors.required');
    errors.imapUser = form.imapUser.trim() ? '' : t('mail.settings.errors.required');
    errors.smtpHost = form.smtpHost.trim() ? '' : t('mail.settings.errors.required');
    errors.smtpUser = form.smtpUser.trim() ? '' : t('mail.settings.errors.required');
  } else {
    errors.imapHost = '';
    errors.imapUser = '';
    errors.smtpHost = '';
    errors.smtpUser = '';
  }
  return !Object.values(errors).some(Boolean);
}

async function handleSave() {
  if (!validate()) return;
  try {
    await store.saveMailbox({
      name: form.name,
      fromName: form.fromName,
      fromAddress: form.fromAddress,
      imapHost: form.imapHost,
      imapPort: form.imapPort,
      imapSecure: form.imapSecure,
      imapUser: form.imapUser,
      imapPassword: form.imapPassword || undefined,
      smtpHost: form.smtpHost,
      smtpPort: form.smtpPort,
      smtpSecure: form.smtpSecure,
      smtpUser: form.smtpUser,
      smtpPassword: form.smtpPassword || undefined,
      enabled: form.enabled,
      backfillDays: form.backfillDays,
    });
    form.imapPassword = '';
    form.smtpPassword = '';
    saved.value = true;
    setTimeout(() => (saved.value = false), 3000);
  } catch {
    // error shown by store
  }
}

async function handleTest() {
  await store.testMailbox();
}

async function handleConnectGoogle() {
  await store.startGoogleOAuth();
}

async function handleDisconnectGoogle() {
  await store.disconnectGoogleOAuth();
  populateForm();
}
</script>
