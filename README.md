# Khirby

Self-hosted, single-tenant CRM — NestJS API, Vue 3 SPA, PostgreSQL, Redis, plugin host.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node 22+](https://img.shields.io/badge/Node-22%2B-green.svg)](https://nodejs.org/)
[![pnpm 11](https://img.shields.io/badge/pnpm-11-blue.svg)](https://pnpm.io/)
[![Docker Hub](https://img.shields.io/badge/Docker-bearlypro%2Fkhirby-blue.svg)](https://hub.docker.com/r/bearlypro/khirby)

**Documentation:** [Getting started](https://khirby.com/docs/guide/getting-started) · [Self-hosted install](https://khirby.com/docs/guide/self-hosted) · [Plugins](https://khirby.com/docs/plugins/) · [Landing forms](https://khirby.com/docs/forms/) · [All docs](https://khirby.com/docs/)

## Quick start

```bash
pnpm install           # first-party plugins come from npm (plugins.manifest.json)
cp .env.example .env   # SESSION_SECRET (≥32), ADMIN_EMAIL, ADMIN_PASSWORD
pnpm start:db          # Postgres + Redis (docker compose)
pnpm migrate
pnpm dev               # API :3000 + Web :5173
```

Production image: **`bearlypro/khirby:latest`** — [self-hosted guide](https://khirby.com/docs/guide/self-hosted) (Compose + env). Hub: [bearlypro/khirby](https://hub.docker.com/r/bearlypro/khirby).

## Stack

| Layer | Tech |
| ----- | ---- |
| API | NestJS + Fastify |
| ORM | Drizzle (PostgreSQL) |
| Sessions | Redis + `@fastify/session` |
| Web | Vue 3 + Vite + Pinia + Tailwind |
| Monorepo | pnpm workspaces |
| Tests | Jest (API) + Vitest (web) |

Requires **Node 22+** and **pnpm 11** (`packageManager` in root `package.json`).

## Environment

See [`.env.example`](./.env.example). Minimum for local:

| Variable | Notes |
| -------- | ----- |
| `DATABASE_URL` | Postgres |
| `REDIS_URL` | Session store |
| `SESSION_SECRET` | ≥ 32 characters |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Bootstrap admin |
| `CORS_ORIGIN` | Dev default `http://localhost:5173`; required allowlist in production |

Full production env list: [Self-hosted installation](https://khirby.com/docs/guide/self-hosted).

## Scripts

| Command | Description |
| ------- | ----------- |
| `pnpm dev` | API + web (watch) |
| `pnpm build` | Build API + web |
| `pnpm verify` | Typecheck + lint + all unit tests |
| `pnpm test` / `pnpm test:web` | API / web tests |
| `pnpm migrate` | Apply SQL migrations |
| `pnpm start:db` / `pnpm stop:db` | Local Postgres + Redis |
| `pnpm docker:up` | Full compose stack |

## Layout

```
apps/api          NestJS API
apps/web          Vue SPA
packages/         @khirby/* (plugin-sdk, plugin-host, types, forms-*)
plugins/          Optional/local: npm-vendored or ./scripts/checkout-plugins.sh (gitignored)
docker/           Dockerfiles, nginx, Swarm/Compose
docs/             Internal ADRs, journal, design system (not the public site)
```

First-party plugins install from **npm** via [`plugins.manifest.json`](./plugins.manifest.json) (`pnpm sync:plugins`). Docker builds do not copy a host `plugins/` tree — sources are vendored from `node_modules` for Nest compile. Plugin authors can clone [Khirby-labs/plugins](https://github.com/Khirby-labs/plugins) with `./scripts/checkout-plugins.sh` and set `KHIRBY_PLUGINS_WORKSPACE=1` to link locally.

Published from this repo (npm):

| Packages | Tag helper |
| -------- | ---------- |
| `@khirby/plugin-sdk`, `@khirby/plugin-host` | `./scripts/publish-plugin-packages.sh khirby-plugins@x.y.z` |
| `@khirby/forms-client`, `@khirby/forms-ui`, `@khirby/payload-forms` | `./scripts/publish-forms-packages.sh khirby-forms@x.y.z` |

## Plugins

Implement `CrmPlugin` from `@khirby/plugin-sdk`; Nest plugins use `@khirby/plugin-host` only (never import `apps/api`).

Public guide: [Create a plugin](https://khirby.com/docs/plugins/create) · [Install a plugin](https://khirby.com/docs/plugins/install)

List packages in `plugins.manifest.json` (with a semver `version`; set `"web": true` when the package exports `./web`). Then `pnpm sync:plugins && pnpm install` — do not hand-edit plugin deps in `package.json`.

## Docs

| Doc | |
| --- | - |
| [Getting started](https://khirby.com/docs/guide/getting-started) | Public product docs (start here) |
| [Self-hosted](https://khirby.com/docs/guide/self-hosted) | Docker Compose deploy |
| [Plugins](https://khirby.com/docs/plugins/) | Authors & operators |
| [Landing forms](https://khirby.com/docs/forms/) | `@khirby/forms-*` |
| [docs/](./docs/) | Internal (ADRs, journal, design system) |

## License

[MIT](./LICENSE) © Khirby Labs
