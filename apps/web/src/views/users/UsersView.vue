<template>
  <div class="flex flex-col w-full h-full min-h-[32rem]">
    <div v-if="error" class="crm-error flex-shrink-0 flex items-center justify-between gap-3">
      <span>{{ t('users.errors.load', { message: error }) }}</span>
      <button
        type="button"
        class="flex-shrink-0 font-medium underline underline-offset-2 hover:no-underline"
        @click="loadData"
      >
        {{ t('common.actions.retry') }}
      </button>
    </div>

    <div
      v-if="loading && !users.length"
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
            {{ memberHeading }}
          </p>
          <button
            type="button"
            class="btn-ghost inline-flex items-center justify-center !px-1.5 !py-1"
            :aria-label="t('users.list.new')"
            :title="t('users.list.new')"
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
          v-if="users.length"
          class="flex-1 min-h-0 flex lg:flex-col gap-1 p-1.5 overflow-x-auto lg:overflow-x-hidden lg:overflow-y-auto"
        >
          <div
            v-for="user in users"
            :key="user.id"
            class="group flex-shrink-0 lg:flex-shrink lg:w-full flex items-center gap-1 rounded-md transition-all duration-150 min-w-[12rem] lg:min-w-0"
            :class="selectedUserId === user.id ? 'bg-accent/15' : 'hover:bg-surface-raise'"
          >
            <button
              class="min-w-0 flex-1 text-left pl-3 pr-1 py-2 rounded-md"
              @click="selectUser(user.id)"
            >
              <span
                class="block text-sm truncate font-mono"
                :class="
                  selectedUserId === user.id
                    ? 'text-text-primary font-medium'
                    : 'text-text-muted group-hover:text-text-primary'
                "
              >
                {{ user.email }}
                <span
                  v-if="editingUsers[user.id] && isDirty(editingUsers[user.id])"
                  class="text-accent"
                  :aria-label="t('users.list.unsaved')"
                  :title="t('users.list.unsaved')"
                  >•</span
                >
              </span>
              <span class="block text-[10px] text-text-ghost mt-0.5 truncate">
                {{ roleSummary(user) }}
              </span>
            </button>
            <div
              class="flex-shrink-0 flex items-center gap-0.5 pr-1.5 transition-opacity duration-150"
              :class="
                selectedUserId === user.id
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
              "
            >
              <button
                type="button"
                class="w-7 h-7 rounded flex items-center justify-center text-text-ghost hover:text-text-primary hover:bg-surface-raise2 transition-colors"
                :aria-label="t('users.list.editAria', { email: user.email })"
                :title="t('users.edit.action')"
                @click="openEdit(user)"
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
                :disabled="user.isSelf || deleting"
                :aria-label="t('users.list.deleteAria', { email: user.email })"
                :title="user.isSelf ? t('users.list.selfDeleteHint') : t('users.delete.action')"
                @click="confirmDeleteUser(user)"
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
        v-if="selectedUser"
        class="flex flex-col min-h-0 min-w-0 overflow-hidden p-4 md:p-5 lg:p-6"
      >
        <div class="flex-shrink-0 min-w-0">
          <h3 class="crm-page-title truncate font-mono">
            {{ selectedUser.email }}
            <span
              v-if="isDirty(selectedUser)"
              class="text-accent"
              :aria-label="t('users.list.unsaved')"
              :title="t('users.list.unsaved')"
              >•</span
            >
          </h3>
          <p class="mt-1 text-sm text-text-muted">
            <!-- One message, one date slot: 'Created' + value used to be two nodes,
                 which no inflected language can reassemble. -->
            <i18n-t keypath="users.detail.created" scope="global" tag="span">
              <template #date>
                <span class="font-mono tabular-nums">{{ formatDate(selectedUser.createdAt) }}</span>
              </template>
            </i18n-t>
            <span v-if="selectedUser.isSelf" class="ml-2 text-text-secondary">
              <span aria-hidden="true">·</span> {{ t('users.detail.self') }}
            </span>
          </p>
        </div>

        <div class="flex flex-col flex-1 min-h-0 mt-5">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-3 flex-shrink-0">
            <div class="flex items-baseline gap-2">
              <h4 class="text-xs font-medium text-text-ghost uppercase tracking-wider">
                {{ t('users.detail.rolesHeading') }}
              </h4>
              <span
                v-if="allRoles.length"
                class="text-[11px] font-mono tabular-nums transition-colors"
                :class="
                  assignedCount === allRoles.length && assignedCount > 0
                    ? 'text-accent'
                    : 'text-text-ghost'
                "
              >
                {{ roleCountLabel }}
              </span>
            </div>
            <div v-if="allRoles.length" class="flex gap-2">
              <button
                class="text-xs text-accent hover:text-accent-hover transition-colors"
                @click="assignAllRoles(selectedUser)"
              >
                {{ t('users.detail.assignAll') }}
              </button>
              <span class="text-text-ghost" aria-hidden="true">·</span>
              <button
                class="text-xs text-text-muted hover:text-text-secondary transition-colors"
                @click="revokeAllRoles(selectedUser)"
              >
                {{ t('users.detail.removeAll') }}
              </button>
            </div>
          </div>

          <div v-if="allRoles.length" class="flex-1 min-h-0 overflow-auto -mx-1 px-1">
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              <button
                v-for="role in allRoles"
                :key="role.id"
                type="button"
                class="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left text-sm transition-all duration-150"
                :class="
                  hasRole(selectedUser, role.id)
                    ? 'border-accent/50 bg-accent/15 text-text-primary'
                    : 'border-border text-text-muted hover:border-border-strong hover:text-text-secondary'
                "
                @click="toggleRole(selectedUser, role)"
              >
                <span
                  class="w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center transition-colors"
                  :class="
                    hasRole(selectedUser, role.id)
                      ? 'bg-accent border-accent text-accent-ink'
                      : 'border-border-strong bg-transparent'
                  "
                >
                  <svg
                    v-if="hasRole(selectedUser, role.id)"
                    class="w-2.5 h-2.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="3"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </span>
                <span class="truncate">{{ role.name }}</span>
              </button>
            </div>
          </div>
          <p v-else class="text-sm text-text-ghost">{{ t('users.detail.noRoles') }}</p>
        </div>

        <div
          class="flex flex-wrap items-center justify-end gap-3 pt-4 mt-auto flex-shrink-0 border-t border-border"
        >
          <button
            class="btn-primary"
            :disabled="saving || !isDirty(selectedUser)"
            @click="saveChanges(selectedUser)"
          >
            {{ saving ? t('common.actions.saving') : t('users.detail.save') }}
          </button>
        </div>
      </section>

      <EmptyState
        v-else-if="!users.length"
        :title="t('users.empty.noneTitle')"
        :message="t('users.empty.noneMessage')"
        class="min-h-[16rem] lg:min-h-0"
      >
        <template #action>
          <button class="btn-primary" @click="openCreate">{{ t('users.list.new') }}</button>
        </template>
      </EmptyState>

      <EmptyState
        v-else
        :title="t('users.empty.selectTitle')"
        :message="t('users.empty.selectMessage')"
        class="min-h-[16rem] lg:min-h-0"
      />
    </div>

    <AppModal
      v-if="editUser"
      :title="t('users.edit.title')"
      :description="t('users.edit.description', { email: editUser.email })"
      @close="closeEdit"
    >
      <form class="space-y-4" @submit.prevent="saveEdit">
        <FormField
          :label="t('users.form.email')"
          required
          :error="editEmailError"
          id="edit-member-email"
        >
          <template #default="{ fieldId, errorId, invalid }">
            <input
              :id="fieldId"
              v-model="editForm.email"
              type="email"
              class="crm-input font-mono"
              :placeholder="t('users.form.emailPlaceholder')"
              :aria-describedby="errorId"
              :aria-invalid="invalid"
              @input="
                editEmailError = '';
                editApiError = '';
              "
            />
          </template>
        </FormField>

        <FormField
          :label="t('users.edit.newPassword')"
          id="edit-member-password"
          :hint="t('users.edit.passwordHint')"
          :error="editPasswordError"
        >
          <template #default="{ fieldId, errorId, invalid }">
            <input
              :id="fieldId"
              v-model="editForm.password"
              type="password"
              minlength="8"
              class="crm-input"
              :placeholder="t('users.form.passwordPlaceholder', { min: PASSWORD_MIN })"
              :aria-describedby="errorId"
              :aria-invalid="invalid"
              @input="
                editPasswordError = '';
                editApiError = '';
              "
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
      :title="t('users.create.title')"
      :description="t('users.create.description')"
      @close="closeCreate"
    >
      <form class="space-y-4" @submit.prevent="submitCreate">
        <FormField
          :label="t('users.form.email')"
          required
          :error="createEmailError"
          id="create-member-email"
        >
          <template #default="{ fieldId, errorId, invalid }">
            <input
              :id="fieldId"
              v-model="createForm.email"
              type="email"
              class="crm-input font-mono"
              :placeholder="t('users.form.emailPlaceholder')"
              :aria-describedby="errorId"
              :aria-invalid="invalid"
              @input="
                createEmailError = '';
                createApiError = '';
              "
            />
          </template>
        </FormField>

        <FormField
          :label="t('users.create.password')"
          required
          id="create-member-password"
          :hint="t('users.form.passwordHint', { min: PASSWORD_MIN })"
          :error="createPasswordError"
        >
          <template #default="{ fieldId, errorId, invalid }">
            <input
              :id="fieldId"
              v-model="createForm.password"
              type="password"
              minlength="8"
              class="crm-input"
              :placeholder="t('users.form.passwordPlaceholder', { min: PASSWORD_MIN })"
              :aria-describedby="errorId"
              :aria-invalid="invalid"
              @input="
                createPasswordError = '';
                createApiError = '';
              "
            />
          </template>
        </FormField>

        <p v-if="createApiError" class="text-xs text-danger">{{ createApiError }}</p>

        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="btn-ghost" :disabled="creating" @click="closeCreate">
            {{ t('common.actions.cancel') }}
          </button>
          <button type="submit" class="btn-primary" :disabled="creating">
            {{ creating ? t('common.actions.creating') : t('users.create.submit') }}
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
import { useUsersStore, type User } from '../../stores/users.store';
import { useRolesStore } from '../../stores/roles.store';
import { useConfirm } from '../../composables/useConfirm';
import { useToastStore } from '../../stores/toast.store';
import { describeLocale, type Locale } from '../../i18n/locales';
import FormField from '../../components/ui/FormField.vue';
import EmptyState from '../../components/ui/EmptyState.vue';
import AppModal from '../../components/AppModal.vue';

const { t, d, n, locale } = useI18n();
const askConfirm = useConfirm();
const toast = useToastStore();
const rolesStore = useRolesStore();
const usersStore = useUsersStore();

interface RoleOption {
  id: string;
  name: string;
}

/** Identity (email/password) is edited via the modal; the pane only edits role assignments. */
interface UserSnapshot {
  roleIds: Set<string>;
}

const PASSWORD_MIN = 8;

const { users, loading, error } = storeToRefs(usersStore);

const allRoles = computed<RoleOption[]>(() =>
  rolesStore.roles.map((r) => ({ id: r.id, name: r.name })),
);

const saving = ref(false);
const deleting = ref(false);

const selectedUserId = ref<string | null>(null);
const editingUsers = reactive<Record<string, User>>({});
const snapshots = reactive<Record<string, UserSnapshot>>({});

const selectedUser = computed((): User | null => {
  if (!selectedUserId.value) return null;
  return editingUsers[selectedUserId.value] ?? null;
});

const assignedCount = computed(
  () => allRoles.value.filter((r) => hasRole(selectedUser.value, r.id)).length,
);

/** One plural message, not a word plus a '(n)' node — see users.list.heading. */
const memberHeading = computed(() =>
  t('users.list.heading', { count: n(users.value.length, 'integer') }, users.value.length),
);

/** One message for the whole fraction; the plural is chosen on the total. */
const roleCountLabel = computed(() =>
  t(
    'users.detail.roleCount',
    { assigned: n(assignedCount.value, 'integer'), total: n(allRoles.value.length, 'integer') },
    allRoles.value.length,
  ),
);

/** Locale-aware enumeration — a ', ' literal is punctuation, and punctuation varies. */
const roleListFormat = computed(
  () =>
    new Intl.ListFormat(describeLocale(locale.value as Locale).intlTag, {
      style: 'narrow',
      type: 'unit',
    }),
);

function roleSummary(user: User): string {
  return user.roles.length
    ? roleListFormat.value.format(user.roles.map((r) => r.name))
    : t('users.list.noRoles');
}

// --- Create modal state ---
const createOpen = ref(false);
const createForm = reactive({ email: '', password: '' });
const createEmailError = ref('');
const createPasswordError = ref('');
const createApiError = ref('');
const creating = ref(false);

// --- Edit modal state ---
const editUser = ref<User | null>(null);
const editForm = reactive({ email: '', password: '' });
const editEmailError = ref('');
const editPasswordError = ref('');
const editApiError = ref('');
const savingEdit = ref(false);

onMounted(() => loadData());

async function loadData() {
  let fetched: User[];
  try {
    // Store owns the list + loading/error; the view keeps its edit buffers in sync.
    fetched = await usersStore.fetchUsers();
  } catch {
    return; // usersStore.error is set — surfaced by the error banner
  }

  // Keep any dirty edit buffers for users that still exist so a refetch never wipes them.
  const keep = new Set(fetched.map((u) => u.id));
  for (const key of Object.keys(editingUsers)) {
    if (!keep.has(key)) {
      delete editingUsers[key];
      delete snapshots[key];
    }
  }
  fetched.forEach((user) => {
    if (editingUsers[user.id] && isDirty(editingUsers[user.id])) return; // preserve unsaved edits
    applyUser(user);
  });

  if (!selectedUserId.value && fetched.length) {
    selectedUserId.value = fetched[0].id;
  } else if (selectedUserId.value && !fetched.some((u) => u.id === selectedUserId.value)) {
    selectedUserId.value = fetched[0]?.id ?? null;
  }

  try {
    await rolesStore.fetchRoles();
  } catch {
    // roles list optional for display
  }
}

/** Seed (or reset) a user's edit buffer + clean snapshot. The store owns the list. */
function applyUser(user: User) {
  editingUsers[user.id] = { ...user, roles: [...user.roles] };
  snapshots[user.id] = { roleIds: new Set(user.roles.map((r) => r.id)) };
}

/** Only role assignments are edited in the pane — email/password live in the modal. */
function isDirty(user: User | null): boolean {
  if (!user) return false;
  const s = snapshots[user.id];
  if (!s) return false;
  const cur = new Set(user.roles.map((r) => r.id));
  if (cur.size !== s.roleIds.size) return true;
  for (const id of cur) if (!s.roleIds.has(id)) return true;
  return false;
}

const anyDirty = computed(() => Object.values(editingUsers).some((u) => isDirty(u)));

/** Restore a user's edit buffer (roles) to its last-saved snapshot. */
function revertUser(id: string) {
  const s = snapshots[id];
  const e = editingUsers[id];
  if (!s || !e) return;
  e.roles = [...s.roleIds].map((roleId) => {
    const match = allRoles.value.find((r) => r.id === roleId);
    return { id: roleId, name: match?.name ?? roleId };
  });
}

async function selectUser(id: string) {
  if (id === selectedUserId.value) return;
  const current = selectedUser.value;
  if (current && isDirty(current)) {
    const ok = await askConfirm({
      title: t('users.discard.title'),
      message: t('users.discard.one', { email: current.email }),
      confirmLabel: t('users.discard.confirm'),
    });
    if (!ok) return;
    revertUser(current.id);
  }
  selectedUserId.value = id;
}

function formatDate(value: string) {
  return value ? d(value, 'dateShort') : '—';
}

function hasRole(user: User | null, roleId: string): boolean {
  if (!user) return false;
  return user.roles.some((r) => r.id === roleId);
}

function toggleRole(user: User, role: RoleOption) {
  if (hasRole(user, role.id)) {
    user.roles = user.roles.filter((r) => r.id !== role.id);
  } else {
    user.roles = [...user.roles, { id: role.id, name: role.name }];
  }
}

function assignAllRoles(user: User) {
  user.roles = allRoles.value.map((r) => ({ id: r.id, name: r.name }));
}

function revokeAllRoles(user: User) {
  user.roles = [];
}

async function saveChanges(user: User) {
  if (!isDirty(user)) return;

  const snapshot = snapshots[user.id];
  if (!snapshot) return;

  saving.value = true;
  try {
    const tasks: Promise<unknown>[] = [];
    const currentRoleIds = new Set(user.roles.map((r) => r.id));
    for (const roleId of currentRoleIds) {
      if (!snapshot.roleIds.has(roleId)) tasks.push(usersStore.assignRole(user.id, roleId));
    }
    for (const roleId of snapshot.roleIds) {
      if (!currentRoleIds.has(roleId)) tasks.push(usersStore.removeRole(user.id, roleId));
    }

    await Promise.all(tasks);
    // Re-baseline only this user, leaving unsaved edits on other users untouched.
    snapshots[user.id] = { roleIds: new Set(currentRoleIds) };
    toast.success(t('users.toast.saved'));
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : t('users.errors.save'));
  } finally {
    saving.value = false;
  }
}

function openEdit(user: User) {
  editUser.value = user;
  editForm.email = user.email;
  editForm.password = '';
  editEmailError.value = '';
  editPasswordError.value = '';
  editApiError.value = '';
}

function closeEdit() {
  editUser.value = null;
}

async function saveEdit() {
  const target = editUser.value;
  if (!target) return;

  const email = editForm.email.trim();
  const password = editForm.password;

  if (!email) {
    editEmailError.value = t('users.form.emailRequired');
    return;
  }
  if (password.length > 0 && password.length < PASSWORD_MIN) {
    editPasswordError.value = t('users.form.passwordMin', { min: PASSWORD_MIN });
    return;
  }

  editEmailError.value = '';
  editPasswordError.value = '';
  editApiError.value = '';
  savingEdit.value = true;
  try {
    const dto: { email?: string; password?: string } = {};
    if (email !== target.email) dto.email = email;
    if (password.length >= PASSWORD_MIN) dto.password = password;

    if (Object.keys(dto).length === 0) {
      closeEdit();
      return;
    }

    const updated = await usersStore.updateUser(target.id, dto);
    // Keep the edit buffer in sync so the pane heading + list reflect the save.
    const buffer = editingUsers[target.id];
    if (buffer) buffer.email = updated.email;
    toast.success(t('users.toast.saved'));
    closeEdit();
  } catch (e: unknown) {
    editApiError.value = e instanceof Error ? e.message : t('users.errors.save');
  } finally {
    savingEdit.value = false;
  }
}

async function confirmDeleteUser(user: User) {
  const ok = await askConfirm({
    title: t('users.delete.title'),
    message: t('users.delete.message', { email: user.email }),
    confirmLabel: t('users.delete.action'),
  });
  if (!ok) return;
  deleting.value = true;
  try {
    await usersStore.deleteUser(user.id);
    delete editingUsers[user.id];
    delete snapshots[user.id];
    if (selectedUserId.value === user.id) {
      selectedUserId.value = users.value[0]?.id ?? null;
    }
    toast.success(t('users.toast.deleted'));
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : t('users.errors.delete'));
  } finally {
    deleting.value = false;
  }
}

function openCreate() {
  createForm.email = '';
  createForm.password = '';
  createEmailError.value = '';
  createPasswordError.value = '';
  createApiError.value = '';
  createOpen.value = true;
}

function closeCreate() {
  createOpen.value = false;
}

async function submitCreate() {
  const email = createForm.email.trim();
  const password = createForm.password;

  if (!email) {
    createEmailError.value = t('users.form.emailRequired');
    return;
  }
  if (password.length < PASSWORD_MIN) {
    createPasswordError.value = t('users.form.passwordMin', { min: PASSWORD_MIN });
    return;
  }

  createEmailError.value = '';
  createPasswordError.value = '';
  createApiError.value = '';
  creating.value = true;
  try {
    const created = await usersStore.createUser(email, password);
    applyUser(created);
    selectedUserId.value = created.id;
    toast.success(t('users.toast.added'));
    closeCreate();
  } catch (e: unknown) {
    // Create itself failed (e.g. duplicate email) — keep the modal open.
    createApiError.value = e instanceof Error ? e.message : t('users.errors.create');
  } finally {
    creating.value = false;
  }
}

// Clear the edit modal if its user disappears (e.g. deleted elsewhere).
watch(users, (list) => {
  if (editUser.value && !list.some((u) => u.id === editUser.value!.id)) closeEdit();
});

onBeforeRouteLeave(async () => {
  if (!anyDirty.value) return true;
  return await askConfirm({
    title: t('users.discard.title'),
    message: t('users.discard.all'),
    confirmLabel: t('users.discard.confirm'),
  });
});
</script>
