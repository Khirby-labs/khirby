# AGENTS.md — Khirby

This file contains instructions for AI coding agents (Claude Code, Codex, OpenCode, etc.) working on this repository. Read it fully before making changes.

---

## Project overview

Modern self-hosted single-tenant CRM. NestJS API + Vue 3 SPA + PostgreSQL + Redis + Drizzle ORM.
Plugin system based on NestJS Dynamic Modules. pnpm workspaces monorepo.

---

## Tech stack

- **Backend:** NestJS, Drizzle ORM 0.40, PostgreSQL (postgres.js driver), Redis (session store via connect-redis), **Fastify** (HTTP adapter)
- **Frontend:** Vue 3, Vite, Pinia, Tailwind CSS, Vue Router 4
- **Tooling:** pnpm workspaces, Jest + ts-jest, TypeScript 5

---

## Repository structure

```
apps/api        — NestJS backend (port 3000)
apps/web        — Vue 3 SPA (port 5173 dev / nginx in prod)
packages/forms-client   — @khirby/forms-client (landing forms SDK)
packages/forms-ui       — @khirby/forms-ui (React form UI for Payload landings)
packages/payload-forms  — @khirby/payload-forms (Payload CMS plugin)
packages/plugin-sdk   — @khirby/plugin-sdk (CrmPlugin interface + events)
packages/plugin-host  — @khirby/plugin-host (guards, tokens for Nest plugins)
packages/types        — @khirby/types
plugins/              — gitignored checkout of github.com/Khirby-labs/plugins (`./scripts/checkout-plugins.sh`)
docker/               — docker-compose.yml, Dockerfiles, nginx.conf
```

Work boards (projects/tasks kanban) are **core** (`apps/api/src/modules/boards/`,
`apps/web/src/views/boards/`) — not a plugin (ADR-0026). Sales pipeline stays separate.

Landing sites consume `@khirby/forms-*` from **npm** (`packages/forms-client/.npmrc.example`, `scripts/publish-forms-packages.sh`). Public product docs for those packages live on the **landing site** (ADR-0029), not under this CRM image. External plugin authors consume `@khirby/plugin-sdk` + `@khirby/plugin-host` from npm (`packages/plugin-sdk/.npmrc.example`, `scripts/publish-plugin-packages.sh`). First-party plugins live in **[Khirby-labs/plugins](https://github.com/Khirby-labs/plugins)** (clone into `./plugins`); this monorepo publishes host packages and forms packages only.

---

## Key conventions

- **KISS + DRY** — keep it simple, avoid duplication
- All DB schema in `apps/api/src/core/database/schema.ts` (single source of truth)
- Migrations are **tracked SQL files** in `drizzle/migrations/` + `meta/_journal.json`.
  Docker runs `migrate.js` before `main.js`; local `pnpm dev` runs **nothing** — apply them
  yourself with `pnpm migrate`. A `schema.ts` edit without a migration file typechecks and
  lints clean while the column does not exist in any database.
  Journal entry `when` must be **`Date.now()`** and strictly greater than the previous
  entry — a backdated `when` is silently skipped by the migrator.
- All NestJS services are `@Injectable()` with constructor DI
- All Vue stores use Pinia `defineStore` with Composition API
- DB injection token: `DB_TOKEN` from `database.module.ts`
- Drizzle 0.40: use `as any` for `.values({})` and `.set({})` due to strict type inference
- All API routes are prefixed with `/api/` (NestJS `app.setGlobalPrefix('api')`)

---

## Authentication

Auth uses **Redis-backed session cookies** — no JWT, no localStorage.

- Guard: `SessionGuard` from `apps/api/src/core/auth/session.guard.ts`
- Session is set on `POST /api/auth/login`, destroyed on `POST /api/auth/logout`
- `req.session.userId` contains the authenticated user's ID
- `PermissionGuard` reads userId from `req.session.userId`
- Frontend sends `credentials: 'include'` on every fetch — cookie handled by browser automatically
- Cookie: `httpOnly: true`, `sameSite: strict`, `secure: true` in production

---

## Testing

- **Run:** `cd apps/api && npx jest --no-coverage`
- All tests in `apps/api/src/**/*.spec.ts` and `plugins/**/*.spec.ts`
- `jest` roots configured in `apps/api/package.json` to include `plugins/`
- Mock DB pattern: `makeChain()` — plain object **without** `.then` at root level
- **DO NOT add `.then` to root db mock** — NestJS DI would inject `[]` instead of the mock

### Mock DB pattern (correct)

```ts
function makeChain(returnValue?: unknown) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    from:   () => chain,
    where:  () => chain,
    // ... other Drizzle chainable methods
    execute: jest.fn().mockResolvedValue(returnValue ?? []),
  };
  // ✅ NO .then on the root object
  return chain;
}
```

---

## Plugin system

- Interface: `CrmPlugin` from `@khirby/plugin-sdk`
- Host surface for Nest plugins: `@khirby/plugin-host` (guards, `DB_TOKEN`, `AppException`, service tokens) — never import `apps/api` from a plugin (ADR-0016)
- Registration: list packages in root `plugins.manifest.json` only — then `pnpm sync:plugins && pnpm install` (writes `apps/api` deps + regenerates loaders). Never hand-edit plugin deps in `apps/api/package.json`.
- The manifest says what is **in the image**; a row in the `plugins` table says what is **installed** (ADR-0032). Marketplace installs a plugin already in the image by writing that row — no manifest edit, no restart. Only an empty `plugins` table seeds the native set, on a first boot.
- An `examples/*` fixture is declared with `"local": "<path>"` in the manifest; it resolves as a workspace link in every environment and is skipped by the vendor step (ADR-0035). Anything compiled into `apps/api/dist` imports `@khirby/plugin-host` **by relative path** — a bare specifier passes every gate and dies at boot in the image.
- Events emitted: `contact.created`, `form.submitted`, …
- Plugin config stored in DB (`plugins` table, `config` jsonb column)
- Context: `{ log(msg), config: Record<string, string> }`
- Example: `examples/crm-plugin-hello`; author guide: `docs/PLUGINS.md`

---

## Common pitfalls

| Pitfall | Detail |
|---------|--------|
| `moduleNameMapper` path | `<rootDir>/../../../packages/...` — `rootDir` = `apps/api/src`, so 3 levels up to repo root |
| Guard name | `SessionGuard` (**NOT** `JwtGuard` — JWT was removed) — see `apps/api/src/core/auth/session.guard.ts` |
| Plugin imports in `app.module.ts` | Use path `../../../plugins/...` relative to `src/` |
| Root db mock | Do **not** add `.then` to the root db mock object in tests |
| Drizzle `.values()` / `.set()` | Add `as any` to avoid strict type inference errors in Drizzle 0.40 |
| pnpm workspace | Always run `pnpm install` from repo root, never from a sub-package directly |
| Session in tests | Mock `req.session = { userId: 'test-id' }` — no JWT mocking needed |
| `/api/` prefix | All backend routes have `api/` global prefix — frontend calls `/api/contacts` not `/contacts` |
| Fastify vs Express | HTTP adapter is Fastify — use `FastifyRequest` not `express.Request`, use `app.register()` not `app.use()` for plugins |
| Fastify session | `req.session.regenerate()` and `req.session.destroy()` are async — await them directly (no callback) |
| Swagger | Only enabled when `NODE_ENV !== 'production'` — available at `/api/docs` in dev |
| UI colors | Never hardcode hex/rgba or use Tailwind's built-in palette in views — semantic token classes only, see `docs/DESIGN-SYSTEM.md` (ADR-0007) |
| UI copy | Never hardcode a user-facing string in `apps/web` — the app ships **pl + en**. Use `t()` with a key, write the copy via `/copy`; rules in `.claude/rules/i18n.md`, voice + glossary in `docs/i18n-copy-guide.md` (ADR-0011) |
| Date inputs | Never `<input type="date">` (or `time`/`month`/`week`) — the browser draws the glyph and panel, so tokens can't reach them. Use `AppDatePicker` / `AppDateRangePicker`; `pnpm lint:design` fails otherwise (ADR-0012) |
| Bare `@khirby/*` value import in anything compiled into `apps/api/dist` | `nest build` is plain tsc and emits the specifier verbatim, while the runtime image ships only the build output plus each package's `package.json` — so it resolves to a sources-free directory and the API dies at boot with `MODULE_NOT_FOUND`. Typecheck, lint, the full suite **and `docker build` all pass**, and `docker.yml` builds images only on `v*.*.*` tags, so it first breaks at release. **Do** import host packages by relative path (`../../../packages/plugin-host/src`) from `plugins/*` and `examples/*`; a plugin installed from npm keeps the bare specifier |
| A `.ts` file listed in `I18N_ENFORCED` | The ratchet parses `<template>` only, so listing a store or composable scans **nothing** and merely looks gated. **Do** keep such entries under the "documentation, not enforcement" comment, and keep user-facing strings out of stores — hold an error *code* and translate it at render |
| Journal `when` timestamp | Always set `meta/_journal.json` `when` to **`Date.now()`** (must be **> previous entry**). A backdated `when` makes `pnpm migrate` exit 0 while **skipping** the SQL — `relation does not exist` at runtime |

---

## Adding a new feature — checklist

1. **Schema first:** add table/column to `apps/api/src/core/database/schema.ts`
2. **Service:** create `feature.service.ts` with `@Injectable()`, inject `DB_TOKEN`
3. **Controller:** create `feature.controller.ts` with `@Controller()` + `@UseGuards(SessionGuard, PermissionGuard)` + `@RequirePermission('resource', 'action')`
4. **Module:** create `feature.module.ts`, import `DatabaseModule` and `RbacModule`
5. **Register:** add `FeatureModule` to `app.module.ts` imports
6. **Tests:** add `feature.service.spec.ts` using the `makeChain()` mock pattern
7. **Frontend:** add a Pinia store + Vue Router route + view component (all API calls use `/api/` prefix)

---

## Do not

- Do not break the `makeChain()` mock pattern — tests depend on it
- Do not use `JwtGuard` — it was removed; use `SessionGuard`
- Do not use JWT or localStorage for auth — session cookie is the only auth mechanism
- Do not add multi-tenancy — this is intentionally single-tenant
- Do not use `TypeORM` or `Prisma` — Drizzle ORM is the chosen ORM
- Do not use the Options API in Vue components — use Composition API (`<script setup>`)
- Do not install packages in sub-packages directly; use `pnpm add -w` or workspace protocol
- Do not add `Authorization` headers in frontend — `credentials: 'include'` handles auth via cookie
- Do not hardcode UI colors or install styled component libraries (PrimeVue, Vuetify…) — use design tokens + headless Reka UI/shadcn-vue; see `docs/DESIGN-SYSTEM.md` and ADR-0007
- Do not write to Linear through MCP tools — the server in `.mcp.json` is the
  read-only endpoint on purpose; use `node .claude/scripts/linear.mjs`
  (`get` / `create` / `comment` / `status` / `labels`), which is pinned to the team
  in `.claude/linear.json` and reads `LINEAR_API_KEY` from `.env` itself
- Do not gate role/role-assignment **mutations** with `@RequirePermission('roles','manage')` — that reopens privilege escalation; use `@RequireSuperAdmin()` (reads keep `roles:manage`); see ADR-0009
