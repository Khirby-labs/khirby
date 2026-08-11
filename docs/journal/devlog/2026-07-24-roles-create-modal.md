# docs/journal/devlog/2026-07-24-roles-create-modal.md
Issue:    none (ad-hoc UX request) · branch worktree-roles-create-modal
Goal:     replace the cramped inline "add role" input at the top of the roles rail with a
          proper "New role" button + modal (name, description, copy permissions from another role)
Done:     RolesView.vue — inline create form removed, "+ New role" button in the rail header (and
          empty-state) opens an AppModal with Name/Description + a "Copy permissions from" AppSelect.
          Store: createRole(name, description?). New RolesView.spec.ts (3 tests: required-name
          validation, create-with-description, copy-permissions mapping). Also removed a
          pre-existing unused import in apps/api rbac.guard.spec (separate commit) that was
          failing `pnpm lint`. pnpm verify ✅ 224 tests.
Why so:   Backend POST /api/roles only takes {name, description} — no way to seed permissions in
          one call — so "copy" is a second PUT /:id/permissions right after create. Copy is mapped
          through the UI's existing per-module `manage` model (RESOURCES.filter(hasManage) → manage
          grants), not raw rows, so it stays consistent with the permissions pane and can't smuggle
          non-`manage` rows (PERMISSION_ACTIONS is only ['manage'] anyway). Kept the modal inline in
          RolesView, mirroring the existing edit modal already in that file — symmetric, low-risk,
          no new component. Partial-failure path (role created, perms PUT fails) leaves the copied
          grants in the edit buffer as *unsaved* + a warning toast, reusing the pane's dirty→Save
          flow, so nothing is silently lost and there's no orphaned empty role.
Failed:   AppSelect stub in the view spec used a TS cast (`$event.target as HTMLSelectElement`)
          inside a runtime `template:` string — the runtime compiler chokes on TS syntax
          ("Unexpected identifier 'as'"), 3 red tests. Dropped the cast (`$event.target.value`).
          Also: passing `:id="fieldId"` to AppSelect was a dead end — it has no `id` prop and
          would fall through onto Reka's renderless SelectRoot; used its `aria-label` instead.
Next:     none required. If create-with-permissions ever becomes hot, a single-call backend
          endpoint would remove the two-step + partial-failure handling — but ADR-0009 governance
          (mutations super-admin only) stands, so not now.
Verify:   pnpm verify ✅ — typecheck 6/6 Done · lint clean · api 168 · web 44 (3 new) ·
          forms-client 9 · forms-ui 3 (224 total). Marker: .claude/.verify-ok.json GREEN.
