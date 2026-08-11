# 2026-07-24 — roles UX redesign + honest permission model

Issue:    — (ad-hoc, follow-up to roles-review-and-hardening) · branch worktree-roles-ux-permissions
Goal:     (1) detail pane header as read-only text, edit/delete via list icons + modal;
          (2) fix 400 on PUT permissions after creating a role as super-admin
Done:     detail header = text; pencil/trash icons on list rows (trash disabled for
          protected); AppModal edit with validation; permission matrix replaced by a
          per-module AppCheckbox list ("n/8 modules"), Grant/Revoke all + dirty
          tracking kept. Catalog moved to @crm/types, shared by api + web.
Why so:   the 400 exposed that the whole backend only checks action 'manage' — the
          matrix's view/create/edit/delete were fiction. Owner decision: per-module
          access (honest), granularity only when the backend enforces it.
Failed:   (a) implementation agent wrote to the main checkout instead of its worktree —
          caught because the live retest saw old UI on the worktree's dev server;
          diff was ported with git apply, main restored. Verify delegated work landed
          in the intended tree before testing it.
          (b) packages/types was named "types", so the first VALUE import of
          '@crm/types' crashed Vite while typecheck/jest stayed green (paths/
          moduleNameMapper masking) — renamed the package, aliased in vite, and used
          a relative import in api's permission-catalog so plain-tsc dist resolves
          at runtime (see INCIDENTS.md, 2 new rows).
Next:     /api/events/stream reconnect-loop floods the console (pre-existing,
          app-shell, unrelated to roles) — needs its own look.
Verify:   pnpm verify ✅ exit 0 (api 168, web 40, forms 12) · live Playwright 7/7 PASS
          (PUT permissions 200, modal flows, discard guards, delete 204, console clean)
