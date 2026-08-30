import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { apiPut, apiPost, apiGet, ApiError } from '../api/client';
import type { SessionUser, LoginResponse } from '@khirby/types';
import { applyAccountLocale } from '../composables/useLocale';
import type { Locale } from '../i18n/locales';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<SessionUser | null>(null);
  const loading = ref(false);
  const checked = ref(false); // czy zrobiliśmy /auth/me check przy starcie
  const networkError = ref(false);

  const isAuthenticated = computed(() => !!user.value);

  function sessionHasPermissions(u: SessionUser | null): u is SessionUser {
    return u !== null && Array.isArray(u.permissions);
  }

  // Sprawdź aktywną sesję przy starcie aplikacji
  async function checkSession(): Promise<void> {
    // A tab left open across a deploy (or Vite HMR) may still hold a user row
    // from before /auth/me started returning permissions — re-fetch until the
    // payload is complete.
    if (checked.value && sessionHasPermissions(user.value)) return;
    try {
      const data = await apiGet<SessionUser>('/api/auth/me');
      user.value = data;
      // The account's language wins over the device resolution done at boot; a
      // null saved value leaves the browser's choice alone (ADR-0011).
      await applyAccountLocale(data.locale);
    } catch (e: unknown) {
      // Branch on the status, never on the message: that string is user-facing
      // copy and gets translated, which would silently reclassify "logged out"
      // as "network down" (ADR-0011).
      if (e instanceof ApiError && e.status === 401) {
        // No session — normal state, don't show error
        user.value = null;
      } else {
        // Network/server error — show message
        user.value = null;
        networkError.value = true;
      }
    } finally {
      checked.value = true;
    }
  }

  async function login(email: string, password: string): Promise<void> {
    loading.value = true;
    try {
      const data = await apiPost<LoginResponse>('/api/auth/login', { email, password });
      user.value = data.user;
      checked.value = true;
      await applyAccountLocale(data.user.locale);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Persists the interface language on the account, so a second device follows it
   * instead of the browser. A no-op while signed out: /login is localized from
   * localStorage alone, and there is no account to write to yet.
   */
  async function saveLocale(next: Locale): Promise<void> {
    if (!user.value) return;
    await apiPut('/api/auth/locale', { locale: next });
    user.value = { ...user.value, locale: next };
  }

  async function logout(): Promise<void> {
    try {
      await apiPost('/api/auth/logout', {});
    } catch {
      // Always clear local auth state even if the server is unreachable
    } finally {
      user.value = null;
      checked.value = false;
    }
  }

  function hasPermission(resource: string, action: string): boolean {
    return (user.value?.permissions ?? []).some(
      (p) => p.resource === resource && p.action === action,
    );
  }

  return {
    user,
    loading,
    checked,
    networkError,
    isAuthenticated,
    checkSession,
    login,
    logout,
    saveLocale,
    hasPermission,
  };
});
