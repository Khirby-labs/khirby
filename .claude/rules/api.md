---
paths:
  - apps/api/**
  - plugins/**
description: NestJS backend + plugins — DI, guards, Drizzle 0.40, makeChain() tests, schema-first, plugin events.
---

# API & plugins rules

Extends the pitfalls table in AGENTS.md — don't duplicate it, this is the working detail.

## NestJS / DI
- Every service is `@Injectable()` with constructor DI. Inject the DB with the `DB_TOKEN`
  token from `apps/api/src/core/database/database.module.ts`.
- New feature order: **schema → service → controller → module → register in `app.module.ts` → tests → frontend.**
- All routes carry the global `/api/` prefix (`app.setGlobalPrefix('api')`). Backend
  code references `contacts`; the frontend calls `/api/contacts`.

## Auth & guards
- Auth is **Redis-backed session cookies** — no JWT, no localStorage.
- Guard is `SessionGuard` (`core/auth/session.guard.ts`) — **never** `JwtGuard` (removed).
  Controllers: `@UseGuards(SessionGuard, PermissionGuard)` + `@RequirePermission('resource','action')`.
- `req.session.userId` is the authenticated user. In tests, mock `req.session = { userId: 'test-id' }` —
  no JWT mocking.

## Fastify (not Express)
- HTTP adapter is **Fastify**: use `FastifyRequest`, not `express.Request`; register plugins with
  `app.register()`, not `app.use()`.
- `req.session.regenerate()` / `req.session.destroy()` are async — `await` them directly (no callback).
- Swagger is only mounted when `NODE_ENV !== 'production'` (dev: `/api/docs`).

## Drizzle 0.40
- All schema in `apps/api/src/core/database/schema.ts` — single source of truth.
- Migrations are **tracked SQL files**, applied by `src/migrate.ts` (Docker runs it before
  `main.js`; local `pnpm dev` does not run it at all — use `pnpm migrate`). Every `schema.ts`
  edit needs its `drizzle/migrations/NNNN_*.sql` **and** a `meta/_journal.json` entry in the
  same commit; verify against `information_schema.columns`, because no static gate reads that
  folder and a missing migration is invisible to typecheck, lint and both guards.
- Journal `when` **MUST be `Date.now()` at authoring time** (ms since epoch), and **strictly
  greater** than the previous entry's `when`. Drizzle only applies migrations with
  `when > lastApplied`; a backdated or invented older timestamp makes `pnpm migrate` print
  `Done` while silently skipping the SQL — tables/columns never appear.
- **Don't** reach for `pnpm db:generate` while the snapshot chain has a hole (`0002_pipeline_leads`
  has no `meta/0002_snapshot.json`, so generate diffs against the 0001 state and would re-create
  the pipeline/leads tables). **Do** hand-write the next `NNNN_*.sql` + journal entry — the
  runtime migrator reads only the journal and the SQL.
- Add `as any` on `.values({})` and `.set({})` — strict type inference in 0.40 otherwise errors.
  `no-explicit-any` is off in ESLint precisely for this convention.

## Tests (Jest)
- Run: `cd apps/api && npx jest --no-coverage`. Specs: `apps/api/src/**/*.spec.ts` and `plugins/**/*.spec.ts`
  (jest `roots` include `plugins/`).
- **DO NOT add `.then` to the root db mock.** NestJS DI would then inject `[]` instead of the mock.
  Use `makeChain()` — a chainable plain object with `.execute()` at the leaf, no `.then` at root.
- `moduleNameMapper` paths are `<rootDir>/../../../packages/...` (`rootDir` = `apps/api/src`, 3 levels to repo root).
- Plugin imports in `app.module.ts` use `../../../plugins/...` relative to `src/`.

## Plugins
- Interface `CrmPlugin` from `@crm/plugin-sdk`; register with `PluginsModule.forRoot([new MyPlugin()])`.
- Events: `contact.created`, `form.submitted`. Config stored in DB (`plugins` table, `config` jsonb).
- Context shape: `{ log(msg), config: Record<string, string> }`.
