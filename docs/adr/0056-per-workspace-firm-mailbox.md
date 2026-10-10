# 0056 — Per-workspace firm mailbox under Enterprise scope

- **Status:** Accepted
- **Date:** 2026-10-10
- **Deciders:** Damian
- **Pokelo ADR id:** `59775c2e-758e-4b84-aef5-4135f18b550f` (Khirby project)

## Context

ADR-0014 made the firm mailbox a **singleton** (`mailboxes` one row). Enterprise
Multi-Workspace (ADR-0055) isolates CRM rows by opaque `scope_id`, and operators
need a different IMAP/SMTP (or Google) mailbox per workspace — one shared inbox
leaks correspondence across firms.

`mailboxes` / `email_threads` / `email_messages` already receive `scope_id` + RLS
from the Multi-Workspace plugin. Core still treated the table as `LIMIT 1` without
scope on the OAuth callback and IDLE worker, so settings and inbound mail could
not stay per workspace.

## Decision

We keep **one firm mailbox per scope** (not per-user inboxes):

- Community / single workspace: still one row (default scope) — ADR-0014 holds.
- With Multi-Workspace: HTTP get/upsert stay `LIMIT 1` under the active scope
  (RLS). Unique index `mailboxes_scope_id_uidx` enforces one row per workspace.
- Google OAuth `state` carries `scopeId` so the cookieless callback writes the
  active workspace’s row.
- The IMAP IDLE worker opens **one session per enabled mailbox** and ingests
  under that mailbox’s `scope_id` via `withScopedDb`.

Core schema stays unaware of `scope_id` (ADR-0055); the unique index lives in the
Multi-Workspace plugin migrate.

## Consequences

- Settings → Mail configures the **active** workspace only; switching workspace
  (full reload) loads that workspace’s mailbox.
- Enabling mailboxes in N workspaces runs N IDLE connections.
- Do **not** reintroduce a global singleton upsert that ignores ALS/RLS when the
  Enterprise plugin is installed.
- ADR-0014’s “one firm mailbox” means one per tenant scope, not one per instance,
  when Multi-Workspace is active.

## Considered alternatives

- **Shared mailbox + label routing** — rejected: credentials and sync pointers are
  per connection; cross-firm leakage risk remains.
- **Move mailbox tables into the plugin** — rejected: threads are core CRM data
  (ADR-0014); scope hooks are enough.
