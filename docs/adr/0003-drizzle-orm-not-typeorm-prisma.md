# 0003 — Drizzle ORM, not TypeORM or Prisma

- **Status:** Accepted (backfilled)
- **Date:** 2026-07-23
- **Deciders:** Damian

## Context

The API needs typed database access over PostgreSQL with a single source of truth
for the schema and a low-ceremony migration story that fits a self-hosted,
auto-migrating deployment.

## Decision

We use **Drizzle ORM 0.40** on the `postgres.js` driver. The entire schema lives
in `apps/api/src/core/database/schema.ts` as the single source of truth. Migrations
are applied on startup via `drizzle-kit push`. The DB handle is injected through
`DB_TOKEN` from `database.module.ts`.

## Consequences

- Schema-as-TypeScript gives end-to-end types without a separate DSL/codegen step;
  the SQL-first query builder stays close to the database.
- `drizzle-kit push` auto-migration is convenient for single-tenant self-hosting
  but is destructive-capable — it must never run against a non-dev database
  casually (see INCIDENTS / guard rails).
- Drizzle 0.40's strict inference on `.values({})` and `.set({})` requires an
  `as any` cast; this is an accepted, documented convention, not a smell to
  "clean up".
- **Do not introduce TypeORM or Prisma.** Mixing ORMs fragments the schema source
  of truth. This is the rationale behind that `AGENTS.md` prohibition.

## Considered alternatives

- **Prisma** — rejected: separate schema DSL + generated client, heavier runtime,
  and its migration model fights auto-push self-hosting.
- **TypeORM** — rejected: decorator/entity duplication of schema, historically
  fragile migrations.
