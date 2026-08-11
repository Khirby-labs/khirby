# 0016 — npm-installable community plugins (manifest + host package)

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Damian

## Context

First-party plugins live under `plugins/` and are wired at compile time
(`new XPlugin()` in `app.module.ts`, hardcoded Vue map in the SPA). Nest plugins
reach into `apps/api/src` via relative imports, so they cannot be published or
installed from npm. Operators and community authors need a path to add a full-stack
plugin (events, Nest controllers, Vue UI, migrations) with `pnpm add` and a config
file — without forking the CRM monorepo. Admin UI install from npm is a later goal;
restart after install remains acceptable.

ADR-0006 still applies to *in-repo* first-party packages (TypeScript source). This
ADR covers the *external* distribution and discovery contract.

## Decision

We support community plugins as npm packages loaded via a root
`plugins.manifest.json` list of package names. Each package exports
`createPlugin(): CrmPlugin` and optionally `exports["./web"]` for Vue. The API
calls `PluginsModule.forRoot(loadPlugins())`; the SPA generates its component map
from the same manifest at build/dev time.

Plugins depend only on published `@crm/plugin-sdk` (types/contracts) and
`@crm/plugin-host` (guards, `DB_TOKEN`, `AppException`, service injection tokens).
They must not import `apps/api`. Those two packages are published to the GitLab
Package Registry (`scripts/publish-plugin-packages.sh`, tags `crm-plugins@…` /
`plugin-sdk@…` / `plugin-host@…`). The host app wires token implementations through a
global bridge module. In-repo plugins keep ADR-0006 source consumption; external
plugins ship compiled (or Vite-consumable) artifacts.

Enable/disable stays in the DB; the manifest only declares what is installed.
HTTP controllers from `getNestModule()` are gated by `PluginEnabledGuard` when the
plugin is disabled.

## Consequences

- Operators install with `pnpm add <pkg>`, add the package to `plugins.manifest.json`,
  and restart API + rebuild/restart web — no `app.module.ts` edit.
- Community authors need a stable, versioned host surface; expanding it is an
  intentional API change (semver on `@crm/plugin-host`).
- First-party Nest plugins must migrate off relative `apps/api` imports onto
  `@crm/plugin-host` (and tokens) so the same code path works for published packages.
- Vue SFCs may ship inside plugin packages; Vite must be configured to compile them
  from `node_modules`.
- Plugin code runs in-process with the API — treat packages as trusted (same trust
  model as native dependencies). Supply-chain controls for UI install belong in a
  later ADR.
- Do not reintroduce hardcoded `new XPlugin()` lists or SPA `pluginComponentMap`
  entries for installable plugins — use the manifest + generator.

## Considered alternatives

- **Manual `app.module` register after `pnpm add`** — rejected as the end state;
  docs already described it and it does not scale for operators.
- **Auto-discovery of every `crm-plugin-*` in node_modules** — deferred; explicit
  manifest is safer and auditable.
- **Runtime admin UI install without restart** — deferred; Nest DynamicModule
  unload/reload is unreliable; restart is the v1 contract.
- **Process sandbox per plugin** — rejected for now (complexity); revisit if
  untrusted marketplace plugins ship.
