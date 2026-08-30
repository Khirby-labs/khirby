# Devlog index

One immutable file per work session in `devlog/`, recording **why** and **what
didn't work** — the things git never captures. One line per entry below, newest
first; open an entry only when it touches current work. Entries are written by the
`/wrap` skill at the end of a session. A session with nothing worth remembering
produces no entry.

Format: `YYYY-MM-DD · <issue> · <slug> — <one-sentence hook>`

- 2026-08-18 · KBY-120 · [kby-120-instance-hot-load](devlog/2026-08-18-kby-120-instance-hot-load.md) — MCP describe/scaffold/validate/install_instance_plugin plus append-only jiti hot-load from INSTANCE_PLUGINS_DIR; ADR-0036; plugins/ on disk had no .git so the MCP half is not in any repo yet
- 2026-08-18 · KBY-103 · [marketplace-v1](devlog/2026-08-18-marketplace-v1.md) — a `plugins` row now means installed and boot seeds only an empty table; catalog page with one-click install that works without a restart; ADR-0032–0035; the fixture's bare plugin-host import would have killed the API at boot in the published image with every gate green
- 2026-07-24 · — · [web-boundary-testing](devlog/2026-07-24-web-boundary-testing.md) — P0–P3: web tests rebuilt to measure boundaries (MSW/DOM) not our own code; MSW foundation, store/router/component specs, @crm/types contract, E2E smoke, coverage+lint gates; ADR-0010; found+fixed pipeline store swallowing server errors
- 2026-07-24 · — · [forms-select-field-type](devlog/2026-07-24-forms-select-field-type.md) — Forms redesign S5 (final): wired the `select` field type end-to-end — options in shared type/validator/DTO + builder options editor + option-membership validation
- 2026-07-24 · — · [forms-list-analytics-polish](devlog/2026-07-24-forms-list-analytics-polish.md) — Forms redesign S4: status dot + rounded-md + tabular-nums on list; analytics skeleton, .crm-error, PageActions cleanup, UTC date-boundary + load-race fixes, EmptyState reset (L1)
- 2026-07-24 · — · [forms-builder-redesign](devlog/2026-07-24-forms-builder-redesign.md) — Forms redesign S3: two-column workshop layout, FormPreview + tabbed IntegrationPanel components, sticky Save via PageActions, field cards, submissions on AppTable + pagination
- 2026-07-24 · — · [forms-builder-data-safety](devlog/2026-07-24-forms-builder-data-safety.md) — Forms redesign S2: unsaved-changes guard, useConfirm+toasts parity, confirm-before-apply-template, pre-save validation, field reorder + stable keys; +3 web spec files
- 2026-07-24 · — · [forms-backend-hardening](devlog/2026-07-24-forms-backend-hardening.md) — Forms redesign S1: trustProxy fix, reject schemas without a required email field (email-keyed architecture), DTO slug/name/type validation, select+unknown-type guard in forms-client
- 2026-07-24 · — · [roles-create-modal](devlog/2026-07-24-roles-create-modal.md) — inline add-role input → "New role" button + modal (name, description, copy-permissions); copy is a 2nd PUT mapped through the per-module `manage` model, partial-failure left as unsaved
- 2026-07-24 · — · [roles-ux-redesign-permission-model](devlog/2026-07-24-roles-ux-redesign-permission-model.md) — matrix actions were fiction (backend checks only 'manage'); per-module toggles + edit modal; "types" package name masked by type-only imports
- 2026-07-24 · — · [roles-review-and-hardening](devlog/2026-07-24-roles-review-and-hardening.md) — live audit caught what static review blessed: every confirm-delete app-wide was a silent no-op (Reka listener order); RBAC lockouts + escalation closed (ADR-0009)
- 2026-07-24 · — · [navigation-shell-redesign](devlog/2026-07-24-navigation-shell-redesign.md) — grouped sidebar + global top bar (contextual slot) + ⌘K palette + Settings console; search is nav-only (ADR-0008)
- 2026-07-24 · — · [agentic-phase-4-review-panel](devlog/2026-07-24-agentic-phase-4-review-panel.md) — blind panel's first run found 3 real bugs in the enforcement layer that built it
- 2026-07-23 · — · [agentic-phase-3-enforcement](devlog/2026-07-23-agentic-phase-3-enforcement.md) — hooks + script layer + /task pipeline: "done" is now enforced, not declared
- 2026-07-23 · — · [agentic-phase-2-journal](devlog/2026-07-23-agentic-phase-2-journal.md) — ADRs + devlog + incidents + skills so knowledge survives between sessions
- 2026-07-23 · — · [agentic-phase-1-context](devlog/2026-07-23-agentic-phase-1-context.md) — thin CLAUDE.md, path-scoped rules, permissions, Linear MCP: same lean context for everyone
- 2026-07-23 · — · [agentic-phase-0-tooling](devlog/2026-07-23-agentic-phase-0-tooling.md) — ESLint/typecheck/Prettier + one `pnpm verify` gate makes "done" mechanical
