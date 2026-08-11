# Roles & Permissions — Plan redesignu

## Problemy do rozwiązania

1. **Dwa osobne Save** — `Save` przy nazwie i `Save Permissions` na dole macierzy. User nie wie czy musi klikać oba.
2. **Manage zaznaczone, reszta pusta** — super-admin wygląda jakby nie miał View/Create/Edit/Delete. Bez hierarchii uprawnień ani logiki "Manage = wszystko".
3. **Brak Select All** — 7 zasobów × 5 akcji = 35 checkboxów do ręcznego klikania.
4. **RESOURCES brakuje `leads`** — w kodzie `const RESOURCES = ['contacts', 'forms', 'roles', 'newsletter', 'integrations', 'settings']` — brak `leads` choć widok to pokazuje.
5. **Delete bez zabezpieczenia** — natychmiast dostępny czerwony przycisk, brak disable dla ról systemowych.
6. **Layout** — macierz zakopana w długim liście kart bez nawigacji między rolami.
7. **Brak feedbacku** — po zapisie nie wiadomo co się stało.

---

## Nowy design — layout 2-kolumnowy

```
┌──────────────────────────────────────────────────────────────────┐
│  Roles & Permissions                          [+ Create Role]    │
├─────────────────┬────────────────────────────────────────────────┤
│  ROLES (2)      │  super-admin                        [Delete]   │
│  ─────────────  │  Full access to everything                     │
│ ● super-admin   │  ───────────────────────────────────────────── │
│   admin         │  PERMISSIONS              [Grant all] [Revoke] │
│                 │  ┌──────────────┬──────┬────────┬──────┬─────┐ │
│                 │  │ Resource     │ View │ Manage │      │     │ │
│                 │  ├──────────────┼──────┼────────┼──────┼─────┤ │
│                 │  │ □ Contacts   │  ☑   │   ☑    │      │     │ │
│                 │  │ □ Leads      │  ☑   │   ☑    │      │     │ │
│                 │  └──────────────┴──────┴────────┴──────┴─────┘ │
│                 │                                  [Save Changes] │
└─────────────────┴────────────────────────────────────────────────┘
```

**Kluczowe zmiany UX:**
- Lewy panel = lista ról (klikalna), prawy = edycja wybranej
- **Jeden przycisk Save Changes** na dole prawego panelu — zapisuje naraz name + description + permissions
- **Grant All / Revoke All** na poziomie całej macierzy
- **Checkbox w nagłówku kolumny** = zaznacz/odznacz całą kolumnę
- **Checkbox wiersza** (pierwsza kolumna) = zaznacz/odznacz cały zasób
- `manage` checkbox w wierszu automatycznie zaznacza pozostałe (lub je dezaktywuje gdy manage = "pełen dostęp")
- `leads` dodany do `RESOURCES`

---

## Zmiany w `RolesView.vue`

### Tylko frontend — zero zmian w backendzie

API obsługuje wszystko czego potrzebujemy:
- `GET /api/roles` — lista
- `PATCH /api/roles/:id` — name + description
- `PUT /api/roles/:id/permissions` — uprawnienia
- `DELETE /api/roles/:id` — usunięcie

### Logika `manage` — semantyka

Obecna baza danych przechowuje uprawnienia jako pary `(resource, action)`.
`manage` to osobna akcja, nie "suma" innych — nie zmieniamy backendu.

**Frontend handling:**
Gdy user zaznacza `manage` dla zasobu → automatycznie zaznacz pozostałe akcje dla tego zasobu.
Gdy user odznacza dowolną akcję gdy `manage` jest zaznaczone → odznacz też `manage`.

```typescript
function togglePermission(role: EditingRole, resource: string, action: string) {
  const current = new Set(
    (role.permissions ?? [])
      .filter(p => p.resource === resource)
      .map(p => p.action)
  );

  if (current.has(action)) {
    current.delete(action);
    // Odznaczenie czegokolwiek → odznacz manage (hierarchia)
    if (action !== 'manage') current.delete('manage');
  } else {
    current.add(action);
    // Zaznaczenie manage → zaznacz wszystkie
    if (action === 'manage') {
      ACTIONS.forEach(a => current.add(a));
    }
  }

  role.permissions = [
    ...(role.permissions ?? []).filter(p => p.resource !== resource),
    ...[...current].map(a => ({ resource, action: a })),
  ];
}
```

### Jeden Save — połączenie obu operacji

```typescript
async function saveChanges(role: EditingRole) {
  saving.value = true;
  saveError[role.id] = null;
  try {
    // Równolegle — name/desc i permissions
    await Promise.all([
      apiPatch(`/api/roles/${role.id}`, {
        name: role.name,
        description: role.description,
      }),
      apiPut(`/api/roles/${role.id}/permissions`, {
        permissions: role.permissions ?? [],
      }),
    ]);
    saved.value = role.id;
    setTimeout(() => { saved.value = null; }, 2500);
    // Odśwież listę żeby nazwa w panelu lewym się zaktualizowała
    await fetchRoles();
  } catch (e: unknown) {
    saveError[role.id] = (e as Error).message ?? 'Save failed';
  } finally {
    saving.value = false;
  }
}
```

### Grant All / Revoke All

```typescript
function grantAll(role: EditingRole) {
  const all: Permission[] = [];
  RESOURCES.forEach(resource => {
    ACTIONS.forEach(action => {
      all.push({ resource, action });
    });
  });
  role.permissions = all;
}

function revokeAll(role: EditingRole) {
  role.permissions = [];
}
```

### Toggle całej kolumny (nagłówek)

```typescript
function toggleColumn(role: EditingRole, action: string) {
  const allChecked = RESOURCES.every(r => hasPermission(role, r, action));
  if (allChecked) {
    // Odznacz całą kolumnę + manage jeśli nie manage
    role.permissions = (role.permissions ?? []).filter(p => {
      if (p.action !== action) return true;
      return false;
    });
    if (action !== 'manage') {
      // Odznaczenie kolumny View/Create/etc → odznacz manage w tych wierszach
      role.permissions = role.permissions.filter(p => p.action !== 'manage');
    }
  } else {
    // Zaznacz brakujące w kolumnie
    RESOURCES.forEach(resource => {
      if (!hasPermission(role, resource, action)) {
        role.permissions = [...(role.permissions ?? []), { resource, action }];
      }
    });
  }
}
```

### Toggle całego wiersza (zasób)

```typescript
function toggleRow(role: EditingRole, resource: string) {
  const allChecked = ACTIONS.every(a => hasPermission(role, resource, a));
  if (allChecked) {
    role.permissions = (role.permissions ?? []).filter(p => p.resource !== resource);
  } else {
    const current = new Set((role.permissions ?? []).filter(p => p.resource === resource).map(p => p.action));
    ACTIONS.forEach(a => current.add(a));
    role.permissions = [
      ...(role.permissions ?? []).filter(p => p.resource !== resource),
      ...[...current].map(a => ({ resource, action: a })),
    ];
  }
}
```

---

## Pełny nowy template `RolesView.vue`

```html
<template>
  <div class="space-y-5 max-w-5xl">
    <!-- Page header -->
    <div class="crm-page-header">
      <h2 class="crm-page-title">Roles & Permissions</h2>
      <button class="btn-primary" @click="showCreateModal = true">+ Create Role</button>
    </div>

    <div v-if="error" class="crm-error">{{ error }}</div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="grid grid-cols-[180px_1fr] gap-4">
      <div class="space-y-2">
        <div v-for="i in 3" :key="i" class="h-9 bg-[rgba(255,255,255,0.04)] rounded-lg animate-pulse" />
      </div>
      <div class="h-64 bg-[rgba(255,255,255,0.04)] rounded-xl animate-pulse" />
    </div>

    <!-- 2-column layout -->
    <div v-else-if="roles.length" class="grid grid-cols-[180px_1fr] gap-4 items-start">

      <!-- Left panel — role list -->
      <div class="crm-panel overflow-hidden">
        <div class="px-3 py-2.5 border-b border-[rgba(255,255,255,0.06)]">
          <p class="text-xs font-medium text-[#62666d] uppercase tracking-wider">
            Roles ({{ roles.length }})
          </p>
        </div>
        <nav class="p-1.5 space-y-0.5">
          <button
            v-for="role in roles"
            :key="role.id"
            class="w-full text-left px-3 py-2 rounded-md text-sm transition-all duration-150"
            :class="selectedRoleId === role.id
              ? 'bg-[rgba(94,106,210,0.15)] text-[#f7f8f8] font-medium'
              : 'text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-[rgba(255,255,255,0.04)]'"
            @click="selectRole(role.id)"
          >
            {{ role.name }}
          </button>
        </nav>
      </div>

      <!-- Right panel — role editor -->
      <div v-if="selectedRole" class="crm-panel p-5 space-y-5">

        <!-- Role name + description -->
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 space-y-3">
            <div>
              <label class="crm-label">Role Name</label>
              <input
                v-model="selectedRole.name"
                class="crm-input max-w-xs"
                placeholder="Role name"
              />
            </div>
            <div>
              <label class="crm-label">Description</label>
              <input
                v-model="selectedRole.description"
                class="crm-input"
                placeholder="Description (optional)"
              />
            </div>
          </div>
          <!-- Delete button — daleko od Save, nie przypadkowe kliknięcie -->
          <button
            class="btn-danger text-xs px-3 py-1.5 mt-6 flex-shrink-0"
            @click="promptDelete({ id: selectedRole.id, name: selectedRole.name })"
          >
            Delete role
          </button>
        </div>

        <!-- Permissions matrix -->
        <div>
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-xs font-medium text-[#62666d] uppercase tracking-wider">Permissions</h4>
            <div class="flex gap-2">
              <button
                class="text-xs text-[#5e6ad2] hover:text-[#7170ff] transition-colors"
                @click="grantAll(selectedRole)"
              >
                Grant all
              </button>
              <span class="text-[#62666d]">·</span>
              <button
                class="text-xs text-[#8a8f98] hover:text-[#d0d6e0] transition-colors"
                @click="revokeAll(selectedRole)"
              >
                Revoke all
              </button>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-xs border border-[rgba(255,255,255,0.06)] rounded-lg overflow-hidden">
              <thead>
                <tr class="bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.06)]">
                  <!-- Resource column header -->
                  <th class="px-4 py-3 text-left text-[#62666d] font-medium uppercase tracking-wider w-36">
                    Resource
                  </th>
                  <!-- Action column headers — klikalne (toggle całej kolumny) -->
                  <th
                    v-for="action in ACTIONS"
                    :key="action"
                    class="px-3 py-3 text-center"
                  >
                    <button
                      class="flex flex-col items-center gap-1 mx-auto group"
                      :title="`Toggle all ${action}`"
                      @click="toggleColumn(selectedRole, action)"
                    >
                      <span class="text-[#62666d] group-hover:text-[#d0d6e0] font-medium uppercase tracking-wider transition-colors">
                        {{ action }}
                      </span>
                      <!-- Mini indicator: ile zaznaczonych w tej kolumnie -->
                      <span
                        class="text-[10px] transition-colors"
                        :class="columnCount(selectedRole, action) === RESOURCES.length
                          ? 'text-[#5e6ad2]'
                          : columnCount(selectedRole, action) > 0
                            ? 'text-[#8a8f98]'
                            : 'text-[#62666d]'"
                      >
                        {{ columnCount(selectedRole, action) }}/{{ RESOURCES.length }}
                      </span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="resource in RESOURCES"
                  :key="resource"
                  class="border-b border-[rgba(255,255,255,0.04)] last:border-0 hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                >
                  <!-- Resource name — klikalny toggle wiersza -->
                  <td class="px-4 py-3">
                    <button
                      class="flex items-center gap-2 group text-left"
                      :title="`Toggle all permissions for ${resource}`"
                      @click="toggleRow(selectedRole, resource)"
                    >
                      <!-- Row all-checked indicator -->
                      <span
                        class="w-3 h-3 rounded flex-shrink-0 border transition-colors"
                        :class="ACTIONS.every(a => hasPermission(selectedRole, resource, a))
                          ? 'bg-[#5e6ad2] border-[#5e6ad2]'
                          : ACTIONS.some(a => hasPermission(selectedRole, resource, a))
                            ? 'border-[#5e6ad2] bg-[#5e6ad2]/30'
                            : 'border-[rgba(255,255,255,0.2)] bg-transparent'"
                      />
                      <span class="text-[#d0d6e0] capitalize group-hover:text-[#f7f8f8] transition-colors font-medium">
                        {{ resource }}
                      </span>
                    </button>
                  </td>
                  <!-- Checkboxes -->
                  <td
                    v-for="action in ACTIONS"
                    :key="action"
                    class="px-3 py-3 text-center"
                  >
                    <button
                      class="w-5 h-5 rounded flex items-center justify-center mx-auto border transition-all duration-150"
                      :class="hasPermission(selectedRole, resource, action)
                        ? 'bg-[#5e6ad2] border-[#5e6ad2] text-white'
                        : 'border-[rgba(255,255,255,0.15)] bg-transparent hover:border-[#5e6ad2]/50'"
                      :aria-label="`${resource} ${action}`"
                      @click="togglePermission(selectedRole, resource, action)"
                    >
                      <svg
                        v-if="hasPermission(selectedRole, resource, action)"
                        class="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Error + Save Changes — JEDEN przycisk -->
        <div class="flex items-center justify-between pt-1 border-t border-[rgba(255,255,255,0.06)]">
          <div v-if="saveError[selectedRole.id]" class="text-xs text-red-400">
            {{ saveError[selectedRole.id] }}
          </div>
          <div v-else-if="saved === selectedRole.id" class="text-xs text-green-400">
            ✓ Changes saved
          </div>
          <div v-else />
          <button
            class="btn-primary"
            :disabled="saving"
            @click="saveChanges(selectedRole)"
          >
            {{ saving ? 'Saving…' : 'Save Changes' }}
          </button>
        </div>

      </div>
    </div>

    <!-- Empty state — brak ról -->
    <div v-else class="crm-empty">
      No roles yet. Create one to get started.
    </div>

    <!-- Create Modal -->
    <AppModal v-if="showCreateModal" @close="showCreateModal = false">
      <h3 class="text-base font-semibold text-[#f7f8f8] mb-5">Create Role</h3>
      <form @submit.prevent="createRole" class="space-y-4">
        <div>
          <label class="crm-label">Name *</label>
          <input v-model="newRole.name" type="text" required class="crm-input" placeholder="e.g. editor" />
        </div>
        <div>
          <label class="crm-label">Description</label>
          <input v-model="newRole.description" type="text" class="crm-input" placeholder="Optional description" />
        </div>
        <div v-if="createError" class="crm-error">{{ createError }}</div>
        <div class="flex gap-2 pt-1">
          <button type="submit" :disabled="creating" class="btn-primary disabled:opacity-40">
            {{ creating ? 'Creating…' : 'Create' }}
          </button>
          <button type="button" class="btn-ghost" @click="showCreateModal = false">Cancel</button>
        </div>
      </form>
    </AppModal>

    <!-- Delete Confirm Modal -->
    <AppModal v-if="itemToDelete" @close="itemToDelete = null">
      <h3 class="text-base font-semibold text-[#f7f8f8] mb-3">Delete role</h3>
      <p class="text-sm text-[#d0d6e0] mb-5">
        Are you sure you want to delete
        <span class="text-[#f7f8f8] font-medium">{{ itemToDelete.name }}</span>?
        Users with this role will lose access. This cannot be undone.
      </p>
      <div v-if="deleteError" class="crm-error mb-4">{{ deleteError }}</div>
      <div class="flex justify-end gap-3">
        <button class="btn-ghost" @click="itemToDelete = null">Cancel</button>
        <button class="btn-danger" :disabled="deleting" @click="confirmDelete">
          {{ deleting ? 'Deleting…' : 'Delete role' }}
        </button>
      </div>
    </AppModal>
  </div>
</template>
```

---

## Pełny nowy `<script setup>` `RolesView.vue`

Logika pozostaje ta sama co teraz — zmiany:
1. `selectedRoleId` + `selectedRole` (computed) — nawigacja między rolami
2. `togglePermission` z logiką `manage`
3. `grantAll`, `revokeAll`, `toggleColumn`, `toggleRow`, `columnCount`
4. `saveChanges` = PATCH + PUT równolegle (zastępuje `saveRole` + `savePermissions`)
5. `RESOURCES` — dodać `'leads'`

```typescript
<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import { apiGet, apiPost, apiPatch, apiDelete, apiPut } from '../../api/client';
import AppModal from '../../components/AppModal.vue';

interface Permission {
  resource: string;
  action: string;
}

interface Role {
  id: string;
  name: string;
  description?: string;
  permissions?: Permission[];
}

// Dodać 'leads' — było brakujące
const RESOURCES = ['contacts', 'leads', 'forms', 'roles', 'newsletter', 'integrations', 'settings'] as const;
const ACTIONS = ['view', 'create', 'edit', 'delete', 'manage'] as const;

const roles = ref<Role[]>([]);
const loading = ref(false);
const error = ref('');
const saving = ref(false);
const saved = ref<string | null>(null);

const selectedRoleId = ref<string | null>(null);

// Deep-clone wybranej roli do edycji (nie mutujemy oryginału w liście)
const editingRoles = reactive<Record<string, Role>>({});

const selectedRole = computed((): Role | null => {
  if (!selectedRoleId.value) return null;
  return editingRoles[selectedRoleId.value] ?? null;
});

const showCreateModal = ref(false);
const newRole = ref({ name: '', description: '' });
const creating = ref(false);
const createError = ref('');

const saveError = reactive<Record<string, string | null>>({});
const deleteError = ref<string | null>(null);
const itemToDelete = ref<{ id: string; name: string } | null>(null);
const deleting = ref(false);

onMounted(() => fetchRoles());

async function fetchRoles() {
  loading.value = true;
  error.value = '';
  try {
    const fetched = await apiGet<Role[]>('/api/roles');
    roles.value = fetched;
    // Zbuduj editable kopie
    fetched.forEach(role => {
      editingRoles[role.id] = { ...role, permissions: [...(role.permissions ?? [])] };
    });
    // Zaznacz pierwszą rolę domyślnie
    if (!selectedRoleId.value && fetched.length) {
      selectedRoleId.value = fetched[0].id;
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load roles';
  } finally {
    loading.value = false;
  }
}

function selectRole(id: string) {
  selectedRoleId.value = id;
}

function hasPermission(role: Role, resource: string, action: string): boolean {
  return (role.permissions ?? []).some(p => p.resource === resource && p.action === action);
}

function columnCount(role: Role, action: string): number {
  return RESOURCES.filter(r => hasPermission(role, r, action)).length;
}

function togglePermission(role: Role, resource: string, action: string) {
  const current = new Set(
    (role.permissions ?? [])
      .filter(p => p.resource === resource)
      .map(p => p.action)
  );

  if (current.has(action)) {
    current.delete(action);
    // Odznaczenie czegokolwiek → odznacz manage (hierarchy)
    if (action !== 'manage') current.delete('manage');
  } else {
    current.add(action);
    // Zaznaczenie manage → zaznacz wszystkie
    if (action === 'manage') {
      ACTIONS.forEach(a => current.add(a));
    }
  }

  role.permissions = [
    ...(role.permissions ?? []).filter(p => p.resource !== resource),
    ...[...current].map(a => ({ resource, action: a })),
  ];
}

function toggleColumn(role: Role, action: string) {
  const allChecked = RESOURCES.every(r => hasPermission(role, r, action));
  if (allChecked) {
    role.permissions = (role.permissions ?? []).filter(p => p.action !== action);
    if (action !== 'manage') {
      role.permissions = role.permissions.filter(p => p.action !== 'manage');
    }
  } else {
    const existing = new Set((role.permissions ?? []).map(p => `${p.resource}:${p.action}`));
    const toAdd: Permission[] = [];
    RESOURCES.forEach(resource => {
      if (!existing.has(`${resource}:${action}`)) {
        toAdd.push({ resource, action });
      }
    });
    role.permissions = [...(role.permissions ?? []), ...toAdd];
  }
}

function toggleRow(role: Role, resource: string) {
  const allChecked = ACTIONS.every(a => hasPermission(role, resource, a));
  role.permissions = [
    ...(role.permissions ?? []).filter(p => p.resource !== resource),
    ...(allChecked ? [] : ACTIONS.map(a => ({ resource, action: a }))),
  ];
}

function grantAll(role: Role) {
  role.permissions = RESOURCES.flatMap(resource =>
    ACTIONS.map(action => ({ resource, action }))
  );
}

function revokeAll(role: Role) {
  role.permissions = [];
}

async function saveChanges(role: Role) {
  saving.value = true;
  saveError[role.id] = null;
  try {
    await Promise.all([
      apiPatch(`/api/roles/${role.id}`, {
        name: role.name,
        description: role.description,
      }),
      apiPut(`/api/roles/${role.id}/permissions`, {
        permissions: role.permissions ?? [],
      }),
    ]);
    saved.value = role.id;
    setTimeout(() => { saved.value = null; }, 2500);
    await fetchRoles();
  } catch (e: unknown) {
    saveError[role.id] = (e as Error).message ?? 'Save failed';
  } finally {
    saving.value = false;
  }
}

function promptDelete(item: { id: string; name: string }) {
  deleteError.value = null;
  itemToDelete.value = item;
}

async function confirmDelete() {
  if (!itemToDelete.value) return;
  deleteError.value = null;
  deleting.value = true;
  try {
    await apiDelete(`/api/roles/${itemToDelete.value.id}`);
    // Po usunięciu — przełącz na inną rolę
    const deletedId = itemToDelete.value.id;
    itemToDelete.value = null;
    delete editingRoles[deletedId];
    await fetchRoles();
    if (selectedRoleId.value === deletedId) {
      selectedRoleId.value = roles.value[0]?.id ?? null;
    }
  } catch (e: unknown) {
    deleteError.value = (e as Error).message ?? 'Delete failed';
  } finally {
    deleting.value = false;
  }
}

async function createRole() {
  createError.value = '';
  creating.value = true;
  try {
    const created = await apiPost<Role>('/api/roles', {
      name: newRole.value.name,
      description: newRole.value.description || undefined,
    });
    newRole.value = { name: '', description: '' };
    showCreateModal.value = false;
    await fetchRoles();
    selectedRoleId.value = created.id;
  } catch (e: unknown) {
    createError.value = e instanceof Error ? e.message : 'Create failed';
  } finally {
    creating.value = false;
  }
}
</script>
```

---

## Czego nie zmieniać

- Backend — zero zmian, API obsługuje wszystko
- Inne widoki
- `AppModal.vue`, `AppTable.vue` — używamy gotowych

---

## Podsumowanie zmian logiki

| Przed | Po |
|-------|-----|
| `saveRole()` + `savePermissions()` — dwa osobne | `saveChanges()` — `Promise.all([PATCH, PUT])` |
| `v-model="role.name"` bezpośrednio na obiekcie z listy | `editingRoles[id]` — deep copy, nie mutujemy oryginału |
| Brak `selectedRole` — wszystkie role renderowane naraz | `selectedRoleId` + `selectedRole` computed |
| `RESOURCES` bez `leads` | Dodane `leads` |
| Native `<input type="checkbox">` | Custom `<button>` ze stylem — spójny z design systemem |
| Brak toggle kolumny/wiersza | `toggleColumn`, `toggleRow`, `grantAll`, `revokeAll` |
| Brak hierarchii manage | `togglePermission` z logiką manage = zaznacza wszystkie |
