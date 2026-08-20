<template>
  <div class="flex flex-col w-full h-full min-h-[32rem]">
    <div v-if="error" class="crm-error flex-shrink-0 flex items-center justify-between gap-3">
      <span>{{ t('roles.errors.load', { message: error }) }}</span>
      <button
        type="button"
        class="flex-shrink-0 font-medium underline underline-offset-2 hover:no-underline"
        @click="fetchRoles"
      >
        {{ t('common.actions.retry') }}
      </button>
    </div>

    <div
      v-if="loading && !roles.length"
      class="crm-panel flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(11rem,15rem)_minmax(0,1fr)] overflow-hidden"
    >
      <div class="border-b xl:border-b-0 xl:border-r border-border p-3 space-y-2">
        <div class="h-8 bg-surface-raise rounded-md animate-pulse" />
        <div v-for="i in 3" :key="i" class="h-9 bg-surface-raise rounded-md animate-pulse" />
      </div>
      <div class="p-4 md:p-5 lg:p-6 min-h-0">
        <div class="h-full min-h-[16rem] bg-surface-raise rounded-lg animate-pulse" />
      </div>
    </div>

    <div
      v-else
      class="crm-panel flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(11rem,15rem)_minmax(0,1fr)] overflow-hidden"
    >
      <aside
        class="flex flex-col flex-shrink-0 max-h-52 xl:max-h-none xl:min-h-0 border-b xl:border-b-0 xl:border-r border-border"
      >
        <div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
          <p class="text-xs font-medium text-text-ghost uppercase tracking-wider">
            {{ roleHeading }}
          </p>
          <button
            type="button"
            class="btn-ghost inline-flex items-center justify-center !px-1.5 !py-1"
            :aria-label="t('roles.list.new')"
            :title="t('roles.list.new')"
            @click="openCreate"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
        </div>

        <nav
          v-if="roles.length"
          class="flex-1 min-h-0 flex lg:flex-col gap-1 p-1.5 overflow-x-auto lg:overflow-x-hidden lg:overflow-y-auto"
        >
          <div
            v-for="role in roles"
            :key="role.id"
            class="group flex-shrink-0 lg:flex-shrink lg:w-full flex items-center gap-1 rounded-md transition-all duration-150"
            :class="selectedRoleId === role.id ? 'bg-accent/15' : 'hover:bg-surface-raise'"
          >
            <button
              class="min-w-0 flex-1 text-left pl-3 pr-1 py-2 rounded-md text-sm truncate"
              :class="
                selectedRoleId === role.id
                  ? 'text-text-primary font-medium'
                  : 'text-text-muted group-hover:text-text-primary'
              "
              @click="selectRole(role.id)"
            >
              {{ role.name }}
              <span
                v-if="editingRoles[role.id] && isDirty(editingRoles[role.id])"
                class="text-accent"
                :aria-label="t('roles.list.unsaved')"
                :title="t('roles.list.unsaved')"
                >•</span
              >
            </button>
            <div
              class="flex-shrink-0 flex items-center gap-0.5 pr-1.5 transition-opacity duration-150"
              :class="
                selectedRoleId === role.id
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
              "
            >
              <button
                type="button"
                class="w-7 h-7 rounded flex items-center justify-center text-text-ghost hover:text-text-primary hover:bg-surface-raise2 transition-colors"
                :aria-label="t('roles.list.editAria', { name: role.name })"
                :title="t('roles.edit.action')"
                @click="openEdit(role)"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="w-7 h-7 rounded flex items-center justify-center text-text-ghost hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-text-ghost disabled:hover:bg-transparent"
                :disabled="role.isProtected || deleting"
                :aria-label="t('roles.list.deleteAria', { name: role.name })"
                :title="role.isProtected ? t('roles.list.protectedHint') : t('roles.delete.action')"
                @click="deleteRole({ id: role.id, name: role.name })"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          </div>
        </nav>
      </aside>

      <section
        v-if="selectedRole"
        class="flex flex-col min-h-0 min-w-0 overflow-hidden p-4 md:p-5 lg:p-6"
      >
        <div class="flex-shrink-0 min-w-0">
          <h3 class="crm-page-title truncate">
            {{ selectedRole.name }}
            <span
              v-if="isDirty(selectedRole)"
              class="text-accent"
              :aria-label="t('roles.list.unsaved')"
              :title="t('roles.list.unsaved')"
              >•</span
            >
          </h3>
          <!-- The seeded super-admin description is localized; an edited one is
               shown exactly as the operator wrote it (ADR-0011). -->
          <p v-if="selectedRole.description" class="mt-1 text-sm text-text-muted">
            {{ roleDescription(selectedRole) }}
          </p>
          <p v-else class="mt-1 text-sm text-text-ghost italic">
            {{ t('roles.detail.noDescription') }}
          </p>
        </div>

        <div class="flex flex-col flex-1 min-h-0 mt-5">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-3 flex-shrink-0">
            <div class="flex items-baseline gap-2">
              <h4 class="text-xs font-medium text-text-ghost uppercase tracking-wider">
                {{ t('roles.detail.modulesHeading') }}
              </h4>
              <span
                class="text-[11px] font-mono tabular-nums transition-colors"
                :class="
                  grantedCount === RESOURCES.length && grantedCount > 0
                    ? 'text-accent'
                    : 'text-text-ghost'
                "
              >
                {{ moduleCountLabel }}
              </span>
            </div>
            <div class="flex gap-2">
              <button
                class="text-xs text-accent hover:text-accent-hover transition-colors"
                @click="grantAll(selectedRole)"
              >
                {{ t('roles.detail.grantAll') }}
              </button>
              <span class="text-text-ghost" aria-hidden="true">·</span>
              <button
                class="text-xs text-text-muted hover:text-text-secondary transition-colors"
                @click="revokeAll(selectedRole)"
              >
                {{ t('roles.detail.revokeAll') }}
              </button>
            </div>
          </div>

          <div class="flex-1 min-h-0 overflow-auto -mx-1 px-1">
            <ul
              class="border border-border rounded-lg overflow-hidden divide-y divide-border-subtle"
            >
              <li
                v-for="resource in RESOURCES"
                :key="resource"
                class="px-4 py-3 hover:bg-surface-raise transition-colors space-y-2"
              >
                <div
                  v-for="pair in pairsForResource(resource)"
                  :key="`${pair.resource}:${pair.action}`"
                  class="flex items-center"
                >
                  <AppCheckbox
                    :model-value="hasPerm(selectedRole, pair.resource, pair.action)"
                    :aria-label="
                      t('roles.permissions.grantAria', {
                        module: moduleLabel(pair.resource, pair.action),
                      })
                    "
                    @update:model-value="
                      (v) => togglePerm(selectedRole!, pair.resource, pair.action, v)
                    "
                  >
                    <span class="font-medium text-text-secondary">{{
                      moduleLabel(pair.resource, pair.action)
                    }}</span>
                  </AppCheckbox>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <div
          class="flex flex-wrap items-center justify-end gap-3 pt-4 mt-auto flex-shrink-0 border-t border-border"
        >
          <button
            class="btn-primary"
            :disabled="saving || !isDirty(selectedRole)"
            @click="saveChanges(selectedRole)"
          >
            {{ saving ? t('common.actions.saving') : t('roles.detail.save') }}
          </button>
        </div>
      </section>

      <EmptyState
        v-else-if="!roles.length"
        :title="t('roles.empty.noneTitle')"
        :message="t('roles.empty.noneMessage')"
        class="min-h-[16rem] lg:min-h-0"
      >
        <template #action>
          <button class="btn-primary" @click="openCreate">{{ t('roles.list.new') }}</button>
        </template>
      </EmptyState>

      <EmptyState
        v-else
        :title="t('roles.empty.selectTitle')"
        :message="t('roles.empty.selectMessage')"
        class="min-h-[16rem] lg:min-h-0"
      />
    </div>

    <AppModal
      v-if="editRole"
      :title="t('roles.edit.title')"
      :description="t('roles.edit.description', { name: editRole.name })"
      @close="closeEdit"
    >
      <form class="space-y-4" @submit.prevent="saveEdit">
        <FormField :label="t('roles.form.name')" :error="editNameError" id="edit-role-name">
          <template #default="{ fieldId, errorId, invalid }">
            <input
              :id="fieldId"
              v-model="editForm.name"
              maxlength="100"
              class="crm-input"
              :placeholder="t('roles.form.namePlaceholder')"
              :aria-describedby="errorId"
              :aria-invalid="invalid"
              :disabled="editRole.isProtected"
              @input="
                editNameError = '';
                editApiError = '';
              "
            />
          </template>
        </FormField>
        <p v-if="editRole.isProtected" class="-mt-2 text-[11px] text-text-ghost leading-tight">
          {{ t('roles.edit.protectedHint') }}
        </p>
        <FormField :label="t('roles.form.description')" id="edit-role-description">
          <template #default="{ fieldId }">
            <textarea
              :id="fieldId"
              v-model="editForm.description"
              maxlength="500"
              rows="3"
              class="crm-input resize-none"
              :placeholder="t('roles.form.descriptionPlaceholder')"
              @input="editApiError = ''"
            />
          </template>
        </FormField>

        <p v-if="editApiError" class="text-xs text-danger">{{ editApiError }}</p>

        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="btn-ghost" :disabled="savingEdit" @click="closeEdit">
            {{ t('common.actions.cancel') }}
          </button>
          <button type="submit" class="btn-primary" :disabled="savingEdit">
            {{ savingEdit ? t('common.actions.saving') : t('common.actions.save') }}
          </button>
        </div>
      </form>
    </AppModal>

    <AppModal
      v-if="createOpen"
      :title="t('roles.create.title')"
      :description="t('roles.create.description')"
      @close="closeCreate"
    >
      <form class="space-y-4" @submit.prevent="submitCreate">
        <FormField
          :label="t('roles.form.name')"
          required
          :error="createNameError"
          id="create-role-name"
        >
          <template #default="{ fieldId, errorId, invalid }">
            <input
              :id="fieldId"
              v-model="createForm.name"
              maxlength="100"
              class="crm-input"
              :placeholder="t('roles.form.nameExample')"
              :aria-describedby="errorId"
              :aria-invalid="invalid"
              @input="
                createNameError = '';
                createApiError = '';
              "
            />
          </template>
        </FormField>

        <FormField :label="t('roles.form.description')" id="create-role-description">
          <template #default="{ fieldId }">
            <textarea
              :id="fieldId"
              v-model="createForm.description"
              maxlength="500"
              rows="3"
              class="crm-input resize-none"
              :placeholder="t('roles.form.descriptionPlaceholder')"
              @input="createApiError = ''"
            />
          </template>
        </FormField>

        <FormField
          v-if="roles.length"
          :label="t('roles.create.copyFrom')"
          id="create-role-copy"
          :hint="t('roles.create.copyFromHint')"
        >
          <template #default>
            <AppSelect
              v-model="createForm.copyFromId"
              :options="copyFromOptions"
              :aria-label="t('roles.create.copyFromAria')"
              trigger-class="w-full"
            />
          </template>
        </FormField>

        <p v-if="createApiError" class="text-xs text-danger">{{ createApiError }}</p>

        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="btn-ghost" :disabled="creating" @click="closeCreate">
            {{ t('common.actions.cancel') }}
          </button>
          <button type="submit" class="btn-primary" :disabled="creating">
            {{ creating ? t('common.actions.creating') : t('roles.create.submit') }}
          </button>
        </div>
      </form>
    </AppModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { onBeforeRouteLeave } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ALL_PERMISSIONS, PERMISSION_RESOURCES } from '@khirby/types';
import { useRolesStore, type Role, type RolePermission } from '../../stores/roles.store';
import { useConfirm } from '../../composables/useConfirm';
import { useServerText } from '../../composables/useServerText';
import { useToastStore } from '../../stores/toast.store';
import FormField from '../../components/ui/FormField.vue';
import EmptyState from '../../components/ui/EmptyState.vue';
import AppCheckbox from '../../components/ui/AppCheckbox.vue';
import AppSelect, { type SelectOption } from '../../components/ui/AppSelect.vue';
import AppModal from '../../components/AppModal.vue';

const { t, n } = useI18n();
const { roleDescription } = useServerText();
const askConfirm = useConfirm();
const toast = useToastStore();
const rolesStore = useRolesStore();

interface RoleSnapshot {
  name: string;
  description: string;
  permKeys: Set<string>;
}

/** Access pairs from the canonical catalog — not a cartesian product. */
const PERMISSION_PAIRS = ALL_PERMISSIONS;
const RESOURCES = PERMISSION_RESOURCES;
const NAME_MAX = 100;
const DESC_MAX = 500;

/**
 * The resource token stays the value everything else keys off; this maps it to a
 * label. `text-transform: capitalize` used to do the job and cannot: it is not
 * Polish casing (.claude/rules/i18n.md). The token set is the closed union
 * PERMISSION_RESOURCES, so the key is safe to build from it.
 */
function moduleLabel(resource: string, action?: string): string {
  if (resource === 'agent' && action) {
    return t(`roles.permissions.agent.${action}`);
  }
  return t(`roles.permissions.resource.${resource}`);
}

function pairsForResource(resource: string) {
  return PERMISSION_PAIRS.filter((p) => p.resource === resource);
}

const { roles, loading, error } = storeToRefs(rolesStore);
const saving = ref(false);
const deleting = ref(false);

const selectedRoleId = ref<string | null>(null);
const editingRoles = reactive<Record<string, Role>>({});
const snapshots = reactive<Record<string, RoleSnapshot>>({});

const selectedRole = computed((): Role | null => {
  if (!selectedRoleId.value) return null;
  return editingRoles[selectedRoleId.value] ?? null;
});

const grantedCount = computed(
  () => PERMISSION_PAIRS.filter((p) => hasPerm(selectedRole.value, p.resource, p.action)).length,
);

/** One plural message, not a word plus a '(n)' node — see roles.list.heading. */
const roleHeading = computed(() =>
  t('roles.list.heading', { count: n(roles.value.length, 'integer') }, roles.value.length),
);

/** One message for the whole fraction; the plural is chosen on the total. */
const moduleCountLabel = computed(() =>
  t(
    'roles.detail.moduleCount',
    { granted: n(grantedCount.value, 'integer'), total: n(PERMISSION_PAIRS.length, 'integer') },
    PERMISSION_PAIRS.length,
  ),
);

// --- Create modal state ---
// Reka Select reserves the empty string to clear a selection, so a SelectItem may
// never carry value="" — use a sentinel for the "no copy" option instead.
const COPY_NONE = '__none__';
const createOpen = ref(false);
const createForm = reactive({ name: '', description: '', copyFromId: COPY_NONE });
const createNameError = ref('');
const createApiError = ref('');
const creating = ref(false);

const copyFromOptions = computed<SelectOption[]>(() => [
  { value: COPY_NONE, label: t('roles.create.copyNone') },
  ...roles.value.map((r) => ({ value: r.id, label: r.name })),
]);

// --- Edit modal state ---
const editRole = ref<Role | null>(null);
const editForm = reactive({ name: '', description: '' });
const editNameError = ref('');
const editApiError = ref('');
const savingEdit = ref(false);

onMounted(() => fetchRoles());

function permKeysOf(role: Role): Set<string> {
  return new Set((role.permissions ?? []).map((p) => `${p.resource}:${p.action}`));
}

function snapshotOf(role: Role): RoleSnapshot {
  return {
    name: role.name,
    description: role.description ?? '',
    permKeys: permKeysOf(role),
  };
}

/** Seed (or reset) a role's edit buffer + clean snapshot. The store owns the list. */
function applyRole(role: Role) {
  editingRoles[role.id] = { ...role, permissions: [...(role.permissions ?? [])] };
  snapshots[role.id] = snapshotOf(editingRoles[role.id]);
}

/** Only permissions are edited in the pane now — name/description live in the modal. */
function isDirty(role: Role | null): boolean {
  if (!role) return false;
  const s = snapshots[role.id];
  if (!s) return false;
  const cur = permKeysOf(role);
  if (cur.size !== s.permKeys.size) return true;
  for (const k of cur) if (!s.permKeys.has(k)) return true;
  return false;
}

const anyDirty = computed(() => Object.values(editingRoles).some((r) => isDirty(r)));

/** Restore a role's edit buffer (permissions) to its last-saved snapshot. */
function revertRole(id: string) {
  const s = snapshots[id];
  const e = editingRoles[id];
  if (!s || !e) return;
  e.permissions = [...s.permKeys].map((k) => {
    const [resource, action] = k.split(':');
    return { resource, action };
  });
}

async function fetchRoles() {
  let fetched: Role[];
  try {
    // Store owns the list + loading/error; the view keeps its edit buffers in sync.
    fetched = await rolesStore.fetchRoles();
  } catch {
    return; // rolesStore.error is set — surfaced by the error banner
  }

  // Keep any dirty edit buffers for roles that still exist so a refetch never wipes them.
  const keep = new Set(fetched.map((r) => r.id));
  for (const key of Object.keys(editingRoles)) {
    if (!keep.has(key)) {
      delete editingRoles[key];
      delete snapshots[key];
    }
  }
  fetched.forEach((role) => {
    if (editingRoles[role.id] && isDirty(editingRoles[role.id])) return; // preserve unsaved edits
    applyRole(role);
  });

  if (!selectedRoleId.value && fetched.length) {
    selectedRoleId.value = fetched[0].id;
  } else if (selectedRoleId.value && !fetched.some((r) => r.id === selectedRoleId.value)) {
    selectedRoleId.value = fetched[0]?.id ?? null;
  }
}

async function selectRole(id: string) {
  if (id === selectedRoleId.value) return;
  const current = selectedRole.value;
  if (current && isDirty(current)) {
    const ok = await askConfirm({
      title: t('roles.discard.title'),
      message: t('roles.discard.one', { name: current.name }),
      confirmLabel: t('roles.discard.confirm'),
    });
    if (!ok) return;
    revertRole(current.id);
  }
  selectedRoleId.value = id;
}

function hasPerm(role: Role | null, resource: string, action: string): boolean {
  if (!role) return false;
  return (role.permissions ?? []).some((p) => p.resource === resource && p.action === action);
}

function togglePerm(role: Role, resource: string, action: string, granted: boolean) {
  const without = (role.permissions ?? []).filter(
    (p) => !(p.resource === resource && p.action === action),
  );
  role.permissions = granted ? [...without, { resource, action }] : without;
}

function grantAll(role: Role) {
  role.permissions = PERMISSION_PAIRS.map((p) => ({ ...p }));
}

function revokeAll(role: Role) {
  role.permissions = [];
}

async function saveChanges(role: Role) {
  if (!isDirty(role)) return;

  saving.value = true;
  try {
    const saved = await rolesStore.setPermissions(role.id, role.permissions ?? []);
    // Re-baseline only this role, leaving unsaved edits on other roles untouched.
    role.permissions = saved;
    snapshots[role.id] = snapshotOf(role);
    toast.success(t('roles.toast.saved'));
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : t('roles.errors.save'));
  } finally {
    saving.value = false;
  }
}

function openEdit(role: Role) {
  editRole.value = role;
  editForm.name = role.name;
  // The STORED description, not the localized one: this buffer is saved back, and
  // a translation must never be written into the database (ADR-0011).
  editForm.description = role.description ?? '';
  editNameError.value = '';
  editApiError.value = '';
}

function closeEdit() {
  editRole.value = null;
}

async function saveEdit() {
  const target = editRole.value;
  if (!target) return;

  const name = editForm.name.trim();
  const description = editForm.description.trim();

  if (!target.isProtected) {
    if (!name) {
      editNameError.value = t('roles.form.nameRequired');
      return;
    }
    if (name.length > NAME_MAX) {
      editNameError.value = t('roles.form.nameTooLong', { max: NAME_MAX });
      return;
    }
  }
  if (description.length > DESC_MAX) {
    editApiError.value = t('roles.form.descriptionTooLong', { max: DESC_MAX });
    return;
  }

  editNameError.value = '';
  editApiError.value = '';
  savingEdit.value = true;
  try {
    const patch: { name?: string; description?: string } = { description };
    if (!target.isProtected) patch.name = name;
    const updated = await rolesStore.updateRole(target.id, patch);

    // Keep the edit buffer + snapshot in sync so the pane heading reflects the save.
    const buffer = editingRoles[target.id];
    if (buffer) {
      buffer.name = updated.name;
      buffer.description = updated.description;
      const snap = snapshots[target.id];
      if (snap) {
        snap.name = updated.name;
        snap.description = updated.description ?? '';
      }
    }
    toast.success(t('roles.toast.saved'));
    closeEdit();
  } catch (e: unknown) {
    editApiError.value = e instanceof Error ? e.message : t('roles.errors.save');
  } finally {
    savingEdit.value = false;
  }
}

async function deleteRole(item: { id: string; name: string }) {
  const ok = await askConfirm({
    title: t('roles.delete.title'),
    message: t('roles.delete.message', { name: item.name }),
    confirmLabel: t('roles.delete.action'),
  });
  if (!ok) return;
  deleting.value = true;
  try {
    await rolesStore.deleteRole(item.id);
    delete editingRoles[item.id];
    delete snapshots[item.id];
    if (selectedRoleId.value === item.id) {
      selectedRoleId.value = roles.value[0]?.id ?? null;
    }
    toast.success(t('roles.toast.deleted'));
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : t('roles.errors.delete'));
  } finally {
    deleting.value = false;
  }
}

function openCreate() {
  createForm.name = '';
  createForm.description = '';
  createForm.copyFromId = COPY_NONE;
  createNameError.value = '';
  createApiError.value = '';
  createOpen.value = true;
}

function closeCreate() {
  createOpen.value = false;
}

/** Permission pairs granted on a source role — used by copy-from. */
function buildCopyPermissions(source: Role | null): RolePermission[] {
  if (!source) return [];
  return PERMISSION_PAIRS.filter((p) => hasPerm(source, p.resource, p.action)).map((p) => ({
    resource: p.resource,
    action: p.action,
  }));
}

async function submitCreate() {
  const name = createForm.name.trim();
  const description = createForm.description.trim();

  if (!name) {
    createNameError.value = t('roles.form.nameRequired');
    return;
  }
  if (name.length > NAME_MAX) {
    createNameError.value = t('roles.form.nameTooLong', { max: NAME_MAX });
    return;
  }
  if (description.length > DESC_MAX) {
    createApiError.value = t('roles.form.descriptionTooLong', { max: DESC_MAX });
    return;
  }

  createNameError.value = '';
  createApiError.value = '';
  creating.value = true;
  try {
    const created = await rolesStore.createRole(name, description || undefined);
    applyRole(created);
    selectedRoleId.value = created.id;

    // Optional: copy another role's module access into the fresh role.
    const copyId = createForm.copyFromId;
    const source =
      copyId && copyId !== COPY_NONE
        ? (editingRoles[copyId] ?? roles.value.find((r) => r.id === copyId) ?? null)
        : null;
    const perms = source ? buildCopyPermissions(source) : [];

    if (perms.length) {
      // Seed the buffer first so the copy is visible immediately and, if the save
      // below fails, remains as unsaved changes the user can Save from the pane.
      editingRoles[created.id].permissions = perms;
      try {
        const saved = await rolesStore.setPermissions(created.id, perms);
        editingRoles[created.id].permissions = saved;
        snapshots[created.id] = snapshotOf(editingRoles[created.id]);
        toast.success(t('roles.toast.created'));
      } catch (e: unknown) {
        toast.error(
          e instanceof Error
            ? t('roles.toast.copyFailedReason', { message: e.message })
            : t('roles.toast.copyFailed'),
        );
      }
    } else {
      toast.success(t('roles.toast.created'));
    }
    closeCreate();
  } catch (e: unknown) {
    // Create itself failed (e.g. duplicate name, insufficient rights) — keep the modal open.
    createApiError.value = e instanceof Error ? e.message : t('roles.errors.create');
  } finally {
    creating.value = false;
  }
}

// Clear the edit modal if its role disappears (e.g. deleted elsewhere).
watch(roles, (list) => {
  if (editRole.value && !list.some((r) => r.id === editRole.value!.id)) closeEdit();
});

onBeforeRouteLeave(async () => {
  if (!anyDirty.value) return true;
  return await askConfirm({
    title: t('roles.discard.title'),
    message: t('roles.discard.all'),
    confirmLabel: t('roles.discard.confirm'),
  });
});
</script>
