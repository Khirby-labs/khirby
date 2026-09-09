<template>
  <div class="crm-panel p-5 space-y-3">
    <h3 class="text-sm font-medium text-text-secondary">{{ t('settings.controlPlane.title') }}</h3>

    <div v-if="loading" class="text-sm text-text-ghost">
      {{ t('settings.controlPlane.loading') }}
    </div>

    <template v-else-if="status">
      <dl class="space-y-2 text-sm">
        <div class="flex items-baseline justify-between gap-3">
          <dt class="text-text-muted">{{ t('settings.controlPlane.telemetry') }}</dt>
          <dd class="text-text-primary">
            {{
              status.telemetryDisabled
                ? t('settings.controlPlane.telemetryOff')
                : t('settings.controlPlane.telemetryOn')
            }}
          </dd>
        </div>

        <div class="flex items-center justify-between gap-3">
          <dt class="flex-shrink-0 text-text-muted">
            {{ t('settings.controlPlane.installationId') }}
          </dt>
          <dd class="min-w-0 flex-1 text-right">
            <button
              type="button"
              class="block w-full truncate font-mono text-xs text-text-primary hover:text-accent"
              :title="status.installationId"
              :aria-label="t('settings.controlPlane.copyId')"
              @click="copyId"
            >
              {{ status.installationId }}
            </button>
          </dd>
        </div>

        <div class="flex items-baseline justify-between gap-3">
          <dt class="text-text-muted">{{ t('settings.controlPlane.registeredEmail') }}</dt>
          <dd class="break-all text-text-primary">
            {{ status.registeredEmail ?? t('settings.controlPlane.notRegistered') }}
          </dd>
        </div>

        <div class="flex items-baseline justify-between gap-3">
          <dt class="text-text-muted">{{ t('settings.controlPlane.lastHeartbeat') }}</dt>
          <dd class="text-text-primary">
            {{
              status.lastHeartbeatAt
                ? d(status.lastHeartbeatAt, 'dateTime')
                : t('settings.controlPlane.never')
            }}
          </dd>
        </div>
      </dl>

      <p v-if="!status.controlPlaneUrlConfigured" class="text-xs text-text-ghost">
        {{ t('settings.controlPlane.notConfigured') }}
      </p>

      <!-- Already registered: Edit opens the form; otherwise the register form stays open. -->
      <div v-if="isRegistered && !editing" class="flex justify-end border-t border-border pt-3">
        <button
          type="button"
          class="btn-ghost px-3 py-1.5 text-sm"
          :disabled="!status.controlPlaneUrlConfigured"
          @click="startEdit"
        >
          {{ t('common.actions.edit') }}
        </button>
      </div>

      <form
        v-else-if="!isRegistered || editing"
        class="space-y-3 border-t border-border pt-3"
        @submit.prevent="handleRegister"
      >
        <FormField :label="t('settings.controlPlane.emailLabel')" required :error="emailError">
          <template #default="{ fieldId, errorId, invalid }">
            <input
              :id="fieldId"
              v-model="email"
              type="email"
              autocomplete="email"
              :aria-describedby="errorId"
              :aria-invalid="invalid"
              class="w-full crm-input"
              :disabled="!status.controlPlaneUrlConfigured || registering"
              @input="emailError = ''"
            />
          </template>
        </FormField>
        <div v-if="formError" class="crm-error">{{ formError }}</div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            class="btn-primary"
            :disabled="!status.controlPlaneUrlConfigured || registering"
          >
            {{
              registering
                ? isRegistered
                  ? t('common.actions.saving')
                  : t('settings.controlPlane.registering')
                : isRegistered
                  ? t('common.actions.save')
                  : t('settings.controlPlane.register')
            }}
          </button>
          <button
            v-if="editing"
            type="button"
            class="btn-ghost px-3 py-1.5 text-sm"
            :disabled="registering"
            @click="cancelEdit"
          >
            {{ t('common.actions.cancel') }}
          </button>
        </div>
      </form>
    </template>

    <p v-else class="text-xs text-text-ghost">{{ t('settings.controlPlane.loadFailed') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGet, apiPost } from '../../api/client';
import { useToastStore } from '../../stores/toast.store';
import FormField from '../../components/ui/FormField.vue';

interface ControlPlaneStatus {
  controlPlaneUrlConfigured: boolean;
  telemetryDisabled: boolean;
  installationId: string;
  registeredEmail: string | null;
  lastHeartbeatAt: string | null;
}

const { t, d } = useI18n();
const toast = useToastStore();

const loading = ref(true);
const status = ref<ControlPlaneStatus | null>(null);
const email = ref('');
const emailError = ref('');
const formError = ref('');
const registering = ref(false);
const editing = ref(false);

const isRegistered = computed(() => Boolean(status.value?.registeredEmail));

async function loadStatus(): Promise<void> {
  loading.value = true;
  try {
    status.value = await apiGet<ControlPlaneStatus>('/api/system/control-plane/status');
    if (status.value.registeredEmail) {
      email.value = status.value.registeredEmail;
    }
  } catch {
    status.value = null;
  } finally {
    loading.value = false;
  }
}

function startEdit(): void {
  email.value = status.value?.registeredEmail ?? '';
  emailError.value = '';
  formError.value = '';
  editing.value = true;
}

function cancelEdit(): void {
  editing.value = false;
  email.value = status.value?.registeredEmail ?? '';
  emailError.value = '';
  formError.value = '';
}

async function copyId(): Promise<void> {
  if (!status.value?.installationId) return;
  try {
    await navigator.clipboard.writeText(status.value.installationId);
    toast.success(t('settings.controlPlane.copied'));
  } catch {
    toast.error(t('settings.controlPlane.copyFailed'));
  }
}

async function handleRegister(): Promise<void> {
  formError.value = '';
  const trimmed = email.value.trim();
  if (!trimmed) {
    emailError.value = t('settings.controlPlane.errors.emailRequired');
    return;
  }
  emailError.value = '';
  registering.value = true;
  const wasRegistered = Boolean(status.value?.registeredEmail);
  try {
    const result = await apiPost<{
      installationId: string;
      registeredEmail: string;
      registeredAt: string;
    }>('/api/system/control-plane/register', { email: trimmed });
    if (status.value) {
      status.value = {
        ...status.value,
        registeredEmail: result.registeredEmail,
        installationId: result.installationId,
      };
    }
    email.value = result.registeredEmail;
    editing.value = false;
    toast.success(
      wasRegistered ? t('common.actions.saved') : t('settings.controlPlane.registered'),
    );
  } catch {
    formError.value = t('settings.controlPlane.errors.registerFailed');
  } finally {
    registering.value = false;
  }
}

onMounted(() => {
  void loadStatus();
});
</script>
