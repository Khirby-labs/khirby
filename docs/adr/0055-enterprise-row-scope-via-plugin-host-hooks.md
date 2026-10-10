# 0055 — Enterprise row scope via plugin-host hooks (core stays single-tenant)

- **Status:** Accepted
- **Date:** 2026-10-10
- **Deciders:** Patryk
- **Pokelo ADR id:** `62acccc3-9139-4f7f-a6a9-27edc79b7fe0` (Khirby project)

## Context

ADR-0004 made the public product intentionally single-tenant: one deployment = one
organization, no `tenant_id` in core. Enterprise needs several independent firms in
one Nest/Vue install without a second deployment. Putting tenant tables, filters, and
UI into `apps/api` / `apps/web` would reverse ADR-0004 for Community and force every
core query to know about multi-tenancy. A plugin alone cannot safely isolate core
reads unless the host exposes a generic, opaque scope surface (connection hooks +
fail-closed).

## Decision

**Community / public core stay single-tenant** (ADR-0004 remains the default).
Enterprise multi-workspace is a **private plugin** plus minimal **opaque Scope hooks**
in `@khirby/plugin-host` / `@khirby/plugin-sdk` (AsyncLocalStorage scope id, DB
`SET LOCAL` / RLS wiring, optional enforcement when a `SCOPE_PROVIDER` is registered).
Core must not grow `tenants` tables, `Tenant*` services, or workspace UI. Isolation is
RLS + host connection hooks, not hand-written `WHERE tenant_id` in domain services.

Docker’s `POSTGRES_USER` is a **superuser with `BYPASSRLS`**, so RLS alone is a no-op.
Scoped requests must `SET LOCAL ROLE` to a non-bypass role (`khirby_scoped`, created by
the Enterprise plugin migrate) and `set_config('app.scope_id', …, true)` on the same
transaction the domain query uses. Writes stamp `scope_id` from that GUC via a trigger
so core services need not set the column.

## Consequences

- Easier: Community image and mental model stay simple; commercial workspace UX lives
  in a private plugin.
- Harder: plugin migrations must `ALTER` core tables and install RLS; every DB path
  must go through the host-wrapped `DB_TOKEN`; disabling the plugin when enforcement
  is required must fail closed (never open all rows).
- **Do not** add multi-tenancy product concepts to `apps/api` / `apps/web` CRM.
- **Do** register scope/admin/membership/dashboard in the private Enterprise plugin
  and use host Scope + optional `AI_USAGE_RECORDER` tokens.

## Considered alternatives

- **Row-level multi-tenancy in core (`tenant_id` everywhere)** — rejected for Community;
  reverses ADR-0004 and puts a permanent leak burden in every service.
- **Schema/database-per-firm with pool router** — rejected for P0 (migration cost and
  plugin compatibility).
- **Plugin-only filters without host hooks** — rejected: core services bypass the
  plugin and would leak across firms.
