import { defineStore } from './session-state';
import { ref } from 'vue';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/client';
import { i18n } from '../i18n';
import type { Member } from '@khirby/types';

/** Stores live outside a component, so they translate off the global instance. */
const t = (key: string) => i18n.global.t(key as never);

// The store's public `User` is the canonical Member shape (kept as an alias so
// existing consumers keep importing `User` from here).
export type User = Member;

export const useUsersStore = defineStore('users', () => {
  const users = ref<User[]>([]);
  const loading = ref(false);
  const error = ref('');

  async function fetchUsers() {
    loading.value = true;
    error.value = '';
    try {
      users.value = await apiGet<User[]>('/api/users');
      return users.value;
    } catch (e: unknown) {
      // Reads as the reason inside the view's sentence: "Couldn't load members: …".
      error.value = e instanceof Error ? e.message : t('users.errors.reasonUnknown');
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createUser(email: string, password: string) {
    const user = await apiPost<User>('/api/users', { email, password });
    users.value = [...users.value, user];
    return user;
  }

  async function updateUser(id: string, dto: { email?: string; password?: string }) {
    const updated = await apiPatch<User>(`/api/users/${id}`, dto);
    const idx = users.value.findIndex((u) => u.id === id);
    if (idx >= 0) users.value[idx] = updated;
    return updated;
  }

  async function deleteUser(id: string) {
    await apiDelete(`/api/users/${id}`);
    users.value = users.value.filter((u) => u.id !== id);
  }

  async function assignRole(userId: string, roleId: string) {
    const updated = await apiPost<User>(`/api/users/${userId}/roles/${roleId}`, {});
    const idx = users.value.findIndex((u) => u.id === userId);
    if (idx >= 0) users.value[idx] = updated;
    return updated;
  }

  async function removeRole(userId: string, roleId: string) {
    const updated = await apiDelete<User>(`/api/users/${userId}/roles/${roleId}`);
    const idx = users.value.findIndex((u) => u.id === userId);
    if (idx >= 0) users.value[idx] = updated;
    return updated;
  }

  return {
    users,
    loading,
    error,
    fetchUsers,
    createUser,
    updateUser,
    deleteUser,
    assignRole,
    removeRole,
  };
});
