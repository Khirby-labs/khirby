# 2026-07-24 — roles review and hardening

Issue:    — (ad-hoc review session) · branch worktree-roles-review-fixes
Goal:     full review of /settings/roles (code + live Playwright UX audit), then fix everything found
Done:     3 review agents (backend/frontend/live UX) → 2 fix agents → 4 live re-test rounds.
          Backend: last-super-admin lockout guards, protected setPermissions, transaction,
          409 on duplicate name, stack-leak fix in all-exceptions.filter, composite PK on
          user_roles, DTO caps + permission-catalog.ts, @RequireSuperAdmin on all role
          mutations (ADR-0009), RBAC per-user cache with invalidation, controller specs
          pattern established. Frontend: ConfirmDialogHost rewrite (see incident), per-role
          dirty tracking + discard guards, roles.store.ts extraction, SettingsLayout/Roles/
          Users breakpoint alignment (md→lg→xl ladder), toasts, a11y (role=checkbox,
          aria-checked mixed, scope=col), EmptyState, Retry in error banners.
Why so:   role mutations gated to super-admin instead of grant-intersection — single-tenant,
          no delegation need (ADR-0009). Confirm fix uses a plain button + first-wins settle
          because Reka AlertDialogAction's internal close listener runs before consumer @click.
Failed:   live audit proved every useConfirm delete app-wide was a silent no-op (network log:
          zero DELETE requests) — static review had marked the delete flow "fully compliant";
          only the live pass caught it. Responsive fix took 3 rounds: each breakpoint change
          exposed the next squeeze (SettingsLayout md → RolesView split lg → fields pair 2xl).
Next:     one-off dedupe of user_roles rows needed on any deployed DB before drizzle-kit push
          applies the new composite PK; duplicate-name 409 message not yet verified live
          (retest ran against the old API).
Verify:   pnpm verify ✅ (api 168 tests / 17 suites, web 40 tests / 7 files, forms 12;
          typecheck + design-guard clean) · live Playwright re-test 8/8 PASS
