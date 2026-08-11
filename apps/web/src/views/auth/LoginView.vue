<template>
  <div class="min-h-screen bg-surface-base flex items-center justify-center px-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <!-- i18n-ignore: brand wordmark, not copy -->
        <p class="text-2xl font-semibold text-text-primary tracking-tight">CRM</p>
        <p class="text-sm text-text-muted mt-1">{{ t('auth.login.subtitle') }}</p>
      </div>

      <div class="crm-panel p-6">
        <form @submit.prevent="handleLogin" class="space-y-4">
          <div>
            <label class="crm-label" for="email">{{ t('auth.login.email') }}</label>
            <input
              id="email"
              v-model="email"
              type="email"
              autocomplete="email"
              required
              class="crm-input"
              :placeholder="t('auth.login.emailPlaceholder')"
            />
          </div>

          <div>
            <label class="crm-label" for="password">{{ t('auth.login.password') }}</label>
            <!-- The dots are decoration, not copy — nothing to translate here. -->
            <input
              id="password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              required
              class="crm-input"
              placeholder="••••••••"
            />
          </div>

          <div v-if="error" class="crm-error">{{ error }}</div>

          <button type="submit" :disabled="auth.loading" class="btn-primary w-full">
            {{ auth.loading ? t('auth.login.submitting') : t('auth.login.submit') }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Renders before a session exists, so nothing here may depend on `auth.user` —
 * the locale comes from the global i18n instance (navigator, or the stored
 * choice), never from the account being signed into.
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth.store';

const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();

const email = ref('');
const password = ref('');
const error = ref('');

async function handleLogin() {
  error.value = '';
  try {
    await auth.login(email.value, password.value);
    await router.push('/contacts');
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : t('auth.login.errors.failed');
  }
}
</script>
