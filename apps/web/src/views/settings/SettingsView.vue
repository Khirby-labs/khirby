<template>
  <div class="max-w-lg space-y-6">
    <div class="crm-panel p-5 space-y-3">
      <h3 class="text-sm font-medium text-text-secondary">{{ t('settings.appearance.title') }}</h3>
      <div
        role="radiogroup"
        :aria-label="t('settings.appearance.themeLabel')"
        class="grid grid-cols-3 gap-2"
      >
        <button
          v-for="opt in themeOptions"
          :key="opt.value"
          type="button"
          role="radio"
          :aria-checked="preference === opt.value"
          class="flex flex-col items-center gap-1.5 rounded-md border px-3 py-3 text-xs font-medium transition-colors"
          :class="
            preference === opt.value
              ? 'border-accent/60 bg-accent/15 text-text-primary'
              : 'border-border bg-surface-input text-text-muted hover:bg-surface-raise hover:text-text-secondary'
          "
          @click="setPreference(opt.value)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-4 w-4"
            aria-hidden="true"
            v-html="opt.icon"
          />
          {{ t(opt.labelKey) }}
        </button>
      </div>
      <p class="text-xs text-text-ghost">{{ t(appearanceHintKey) }}</p>
    </div>

    <div class="crm-panel p-5 space-y-3">
      <h3 class="text-sm font-medium text-text-secondary">{{ t('settings.language.title') }}</h3>
      <div
        role="radiogroup"
        :aria-label="t('settings.language.groupLabel')"
        class="grid grid-cols-2 gap-2"
      >
        <!-- Option labels are endonyms, rendered raw: a reader looking for their
             language recognises "Polski", not "Polish" translated into a language
             they cannot read (ADR-0011). -->
        <button
          v-for="opt in localeOptions"
          :key="opt.value"
          type="button"
          role="radio"
          :aria-checked="locale === opt.value"
          class="rounded-md border px-3 py-2.5 text-xs font-medium transition-colors"
          :class="
            locale === opt.value
              ? 'border-accent/60 bg-accent/15 text-text-primary'
              : 'border-border bg-surface-input text-text-muted hover:bg-surface-raise hover:text-text-secondary'
          "
          @click="chooseLocale(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
      <p class="text-xs text-text-ghost">{{ t('settings.language.hint') }}</p>
    </div>

    <div class="crm-panel p-5 space-y-4">
      <h3 class="text-sm font-medium text-text-secondary">{{ t('settings.password.title') }}</h3>
      <form @submit.prevent="handleChangePassword" class="space-y-3" novalidate>
        <FormField :label="t('settings.password.current')" required :error="fieldErrors.current">
          <template #default="{ fieldId, errorId, invalid }">
            <input
              :id="fieldId"
              v-model="form.currentPassword"
              type="password"
              :aria-describedby="errorId"
              :aria-invalid="invalid"
              class="w-full crm-input"
              @input="fieldErrors.current = ''"
            />
          </template>
        </FormField>
        <FormField
          :label="t('settings.password.new')"
          required
          :error="fieldErrors.new"
          :hint="t('settings.password.hint')"
        >
          <template #default="{ fieldId, errorId, invalid }">
            <input
              :id="fieldId"
              v-model="form.newPassword"
              type="password"
              :aria-describedby="errorId"
              :aria-invalid="invalid"
              class="w-full crm-input"
              @input="fieldErrors.new = ''"
            />
          </template>
        </FormField>
        <FormField :label="t('settings.password.confirm')" required :error="fieldErrors.confirm">
          <template #default="{ fieldId, errorId, invalid }">
            <input
              :id="fieldId"
              v-model="form.confirmPassword"
              type="password"
              :aria-describedby="errorId"
              :aria-invalid="invalid"
              class="w-full crm-input"
              @input="fieldErrors.confirm = ''"
            />
          </template>
        </FormField>
        <div v-if="error" class="crm-error">{{ error }}</div>
        <div class="flex items-center gap-3">
          <button type="submit" :disabled="saving" class="btn-primary">
            {{ saving ? t('common.actions.saving') : t('settings.password.submit') }}
          </button>
          <span v-if="saved" class="text-xs text-success">
            <span aria-hidden="true">✓</span> {{ t('settings.password.success') }}
          </span>
        </div>
      </form>
    </div>

    <div class="crm-panel p-5">
      <h3 class="text-sm font-medium text-text-secondary mb-1">
        {{ t('settings.account.title') }}
      </h3>
      <p class="text-sm text-text-ghost">{{ auth.user?.email }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth.store';
import { apiPost } from '../../api/client';
import { useTheme, THEME_OPTIONS } from '../../composables/useTheme';
import { useLocale } from '../../composables/useLocale';
import type { Locale } from '../../i18n/locales';
import FormField from '../../components/ui/FormField.vue';

const { t } = useI18n();
const auth = useAuthStore();

const { preference, resolvedTheme, setPreference } = useTheme();
const { locale, setLocale, options: localeOptions } = useLocale();

const themeOptions = THEME_OPTIONS;

/**
 * Switch now, remember later. `setLocale` repaints and writes localStorage, which
 * is what /login reads before any session exists; `saveLocale` stores the choice
 * on the account so a second device follows it instead of its own browser. The
 * account write is a no-op when signed out (ADR-0011).
 */
async function chooseLocale(next: Locale): Promise<void> {
  await setLocale(next);
  await auth.saveLocale(next);
}

/**
 * One whole sentence per branch instead of interpolating the theme name into
 * prose: an adjective has to agree with its noun, which is impossible when the
 * enum arrives as a parameter (`.claude/rules/i18n.md`).
 */
const appearanceHintKey = computed(() => {
  if (preference.value === 'system') {
    return resolvedTheme.value === 'dark'
      ? 'settings.appearance.systemHintDark'
      : 'settings.appearance.systemHintLight';
  }
  return preference.value === 'dark'
    ? 'settings.appearance.fixedHintDark'
    : 'settings.appearance.fixedHintLight';
});

const form = ref({ currentPassword: '', newPassword: '', confirmPassword: '' });
const fieldErrors = reactive({ current: '', new: '', confirm: '' });
const saving = ref(false);
const saved = ref(false);
const error = ref('');

function validate(): boolean {
  fieldErrors.current = form.value.currentPassword
    ? ''
    : t('settings.password.errors.currentRequired');
  fieldErrors.new =
    form.value.newPassword.length >= 8 ? '' : t('settings.password.errors.tooShort');
  fieldErrors.confirm =
    form.value.confirmPassword === form.value.newPassword
      ? ''
      : t('settings.password.errors.mismatch');
  return !fieldErrors.current && !fieldErrors.new && !fieldErrors.confirm;
}

async function handleChangePassword() {
  error.value = '';
  if (!validate()) return;
  saving.value = true;
  try {
    await apiPost('/api/auth/change-password', {
      currentPassword: form.value.currentPassword,
      newPassword: form.value.newPassword,
    });
    form.value = { currentPassword: '', newPassword: '', confirmPassword: '' };
    saved.value = true;
    setTimeout(() => (saved.value = false), 3000);
  } catch (e: unknown) {
    error.value = (e as Error).message || t('settings.password.errors.failed');
  } finally {
    saving.value = false;
  }
}
</script>
