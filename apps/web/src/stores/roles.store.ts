import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from '../api/client';
import { i18n } from '../i18n';
import type { Role, RolePermission } from '@khirby/types';

/** Stores live outside a component, so they translate off the global instance. */
const t = (key: string) => i18n.global.t(key as never);

// Re-exported so existing consumers keep importing these from the store.
export type { Role, RolePermission };

export const useRolesStore = defineStore('roles', () => {
  const roles = ref<Role[]>([]);
  const loading = ref(false);
  const error = ref('');

  async function fetchRoles() {
    loading.value = true;
    error.value = '';
    try {
      roles.value = await apiGet<Role[]>('/api/roles');
      return roles.value;
    } catch (e: unknown) {
      // Reads as the reason inside the view's sentence: "Couldn't load roles: …".
      error.value = e instanceof Error ? e.message : t('roles.errors.reasonUnknown');
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createRole(name: string, description?: string) {
    const body = description ? { name, description } : { name };
    const created = await apiPost<Role>('/api/roles', body);
    roles.value = [...roles.value, created];
    return created;
  }

  async function updateRole(id: string, patch: { name?: string; description?: string }) {
    const updated = await apiPatch<Role>(`/api/roles/${id}`, patch);
    const idx = roles.value.findIndex((r) => r.id === id);
    if (idx >= 0) roles.value[idx] = updated;
    return updated;
  }

  async function setPermissions(id: string, permissions: RolePermission[]) {
    // The endpoint returns the persisted permission rows, not the full role.
    const saved = await apiPut<RolePermission[]>(`/api/roles/${id}/permissions`, { permissions });
    const idx = roles.value.findIndex((r) => r.id === id);
    if (idx >= 0) roles.value[idx] = { ...roles.value[idx], permissions: saved };
    return saved;
  }

  async function deleteRole(id: string) {
    await apiDelete(`/api/roles/${id}`);
    roles.value = roles.value.filter((r) => r.id !== id);
  }

  return { roles, loading, error, fetchRoles, createRole, updateRole, setPermissions, deleteRole };
});
