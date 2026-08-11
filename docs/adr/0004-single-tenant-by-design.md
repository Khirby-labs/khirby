# 0004 — Single-tenant by design

- **Status:** Accepted (backfilled)
- **Date:** 2026-07-23
- **Deciders:** Damian

## Context

The product is a self-hosted CRM: each deployment belongs to one organization that
runs its own instance. Multi-tenancy (tenant scoping on every table, tenant-aware
guards, per-tenant connection routing) is a large, pervasive complexity that would
touch schema, queries, auth, and caching everywhere.

## Decision

The system is **intentionally single-tenant**. There is no tenant column, no
tenant scoping, and no cross-tenant isolation logic. One deployment = one
organization.

## Consequences

- Schema, queries, and guards stay simple; no tenant predicate threads through
  every read and write.
- Horizontal isolation between organizations is achieved by running separate
  deployments, not by application logic.
- **Do not add multi-tenancy** — not a "column here, filter there"; it is an
  architectural direction we have deliberately not taken. Introducing it partially
  is worse than not at all. This is the rationale behind that `AGENTS.md`
  prohibition; revisiting it requires a superseding ADR.

## Considered alternatives

- **Row-level multi-tenancy (tenant_id everywhere)** — rejected: pervasive
  complexity and a permanent correctness burden (one missing filter = data leak)
  for a product sold as self-hosted single-tenant.
