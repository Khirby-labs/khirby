<template>
  <div class="min-h-screen bg-surface-base flex items-center justify-center px-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <p class="text-2xl font-semibold text-text-primary tracking-tight">CRM</p>
        <p class="text-sm text-text-muted mt-1">{{ t('auth.oidc.callbackTitle') }}</p>
      </div>

      <div class="crm-panel p-6 space-y-4">
        <p v-if="!error" class="text-sm text-text-secondary text-center">
          {{ t('auth.oidc.completing') }}
        </p>
        <div v-if="error" class="crm-error">{{ error }}</div>
        <router-link v-if="error" to="/login" class="btn-ghost w-full text-center block">
          {{ t('auth.oidc.backToLogin') }}
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth.store';
import { ApiError } from '../../api/client';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const error = ref('');

onMounted(async () => {
  const idpError = typeof route.query.error === 'string' ? route.query.error : null;
  if (idpError) {
    const desc =
      typeof route.query.error_description === 'string' ? route.query.error_description : null;
    error.value = desc?.trim() || idpError;
    return;
  }

  const code = typeof route.query.code === 'string' ? route.query.code : '';
  const state = typeof route.query.state === 'string' ? route.query.state : '';
  if (!code || !state) {
    error.value = t('auth.oidc.errors.missingParams');
    return;
  }

  try {
    await auth.completeOidcLogin(code, state);
    await router.replace('/contacts');
  } catch (e: unknown) {
    // Prefer machine code when present — "Invalid credentials" for a lost
    // OIDC state is confusing on this page.
    if (e instanceof ApiError) {
      error.value =
        e.code === 'INVALID_CREDENTIALS' || e.code === 'SESSION_EXPIRED'
          ? t('auth.oidc.errors.failed')
          : e.message || t('auth.oidc.errors.failed');
    } else {
      error.value = e instanceof Error ? e.message : t('auth.oidc.errors.failed');
    }
  }
});
</script>
