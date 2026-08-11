# PLUGINS.md — Creating Khirby Plugins

This guide explains how to build, test, configure, install, and distribute plugins
for Khirby. Architecture: [ADR-0016](adr/0016-npm-community-plugins.md).
In-repo first-party plugins still follow [ADR-0006](adr/0006-plugins-consumed-as-ts-source.md)
(TypeScript source); community packages ship as npm artifacts.

---

## Table of Contents

- [What is a plugin?](#what-is-a-plugin)
- [Install an existing plugin](#install-an-existing-plugin)
- [CrmPlugin contract](#crmplugin-contract)
- [Host surface (`@khirby/plugin-host`)](#host-surface-crmplugin-host)
- [Step-by-step: creating a plugin](#step-by-step-creating-a-plugin)
- [Vue UI (`exports["./web"]`)](#vue-ui-exportsweb)
- [Configuration](#configuration)
- [Testing](#testing)
- [Distributing](#distributing)
- [Example](#example)

---

## What is a plugin?

A plugin implements `CrmPlugin` from `@khirby/plugin-sdk` and is loaded at API
startup from root [`plugins.manifest.json`](../plugins.manifest.json). It may:

- Handle CRM events (`onEvent`)
- Run SQL migrations (`onMigrate`)
- Mount Nest controllers (`getNestModule`)
- Contribute Vue routes (`getFrontendRoutes` + package `./web` entry)
- Declare a config schema for the Plugins settings UI

Plugins run **in-process** with the API — treat installed packages as trusted code.

---

## Install an existing plugin

```bash
# From repo / deploy root
pnpm add crm-plugin-slack
```

Add the package to `plugins.manifest.json` (optional `version` when not using a
local `plugins/` checkout — defaults to `workspace:*` locally, else `*` / installed semver):

```json
{
  "plugins": [
    { "package": "@khirby/plugin-webhook" },
    { "package": "@khirby/plugin-slack", "version": "^1.2.0" }
  ]
}
```

Sync API dependencies + regenerate loaders, then install:

```bash
pnpm sync:plugins
pnpm install
# restart API + rebuild/restart web
```

Do **not** hand-edit plugin lines in `apps/api/package.json` — `scripts/sync-plugin-deps.mjs`
owns them (`apps/api/plugin-deps.generated.json`). Marketplace install (later) will
write the manifest and run the same sync.

Enable/disable and config stay in the DB (Plugins UI). The manifest only lists
what is **installed**. Admin UI install from npm is planned later (still requires
process restart).

---

## CrmPlugin contract

```ts
import type { CrmPlugin, CreatePlugin } from '@khirby/plugin-sdk';

export class MyPlugin implements CrmPlugin {
  name = 'crm_my_plugin';       // snake_case, unique
  displayName = 'My Plugin';    // English literal (i18n key optional)
  version = '1.0.0';
  // onMigrate?, onInit?, onEvent?, getNestModule?, getFrontendRoutes?, getConfigSchema?
}

export const createPlugin: CreatePlugin = () => new MyPlugin();
```

Every installable package **must** export `createPlugin()`.

---

## Host surface (`@khirby/plugin-host`)

Nest plugins must **not** import `apps/api`. Use `@khirby/plugin-host`:

| Export | Use |
|--------|-----|
| `SessionGuard`, `PermissionGuard`, `RequirePermission` | HTTP authz |
| `PluginEnabledGuard`, `RequirePluginEnabled(name)` | Block routes when plugin disabled |
| `DB_TOKEN`, `Db` | Drizzle client (prefer plugin-owned tables via `onMigrate`) |
| `AppException` | Coded HTTP errors |
| `PLUGIN_REGISTRY`, `CONTACTS_SERVICE`, `LEADS_SERVICE`, … | Inject host services |

The host app wires token implementations through `PluginBridgeModule`.

---

## Step-by-step: creating a plugin

1. Scaffold a package (`@khirby/plugin-*`), depend on `@khirby/plugin-sdk` (+ `@khirby/plugin-host` if you ship Nest controllers).
2. Implement `CrmPlugin` + `createPlugin()`.
3. Optional Nest module: controllers use host guards only.
4. Optional `exports["./web"]` — see below.
5. Publish to npm (or link locally).
6. Operator: `pnpm add` → manifest → generate → restart.

Golden path: [`examples/crm-plugin-hello`](../examples/crm-plugin-hello).

---

## Vue UI (`exports["./web"]`)

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./web": "./dist/web/index.js"
  }
}
```

```ts
// src/web/index.ts
import type { PluginWebEntry } from '@khirby/plugin-sdk';

export const webEntry: PluginWebEntry = {
  name: 'crm_my_plugin', // MUST equal CrmPlugin.name
  component: () => import('./MyView.vue'),
  messages: { en: { … }, pl: { … } }, // optional
};
```

`scripts/generate-plugin-loader.mjs` writes
`apps/web/src/plugins/plugin-registry.generated.ts` from the same manifest.
Backend `getFrontendRoutes()` still supplies path/nav metadata; the SPA merges
the real component by plugin `name`.

---

## Configuration

Config lives in the `plugins` table (`config` jsonb), edited in the UI from
`getConfigSchema()`. Not environment variables.

Interactive settings that cannot be a static schema (token rotate/reveal,
encrypted keys, remote pickers) belong in a custom panel mounted inside
**Settings → Plugins → Konfiguruj**, not as a sidebar route (ADR-0023). First-party
panels are registered in `apps/web/src/plugins/plugin-registry.ts`
(`pluginSettingsPanels`). Operational UIs (campaigns) still use
`getFrontendRoutes()`. Optional `showInNav: false` on a frontend route registers
the path without a sidebar / ⌘K entry.

---

## Testing

Place `*.spec.ts` next to plugin sources. Jest roots include `plugins/`
(`apps/api` package). Use the `makeChain()` DB mock pattern from AGENTS.md.

```bash
cd apps/api && npx jest --testPathPattern=crm-plugin-hello
pnpm --filter api test   # full API + plugin suite
```

---

## Distributing

### Host packages (for external authors)

`@khirby/plugin-sdk` and `@khirby/plugin-host` are published to **npm** from this
monorepo. First-party plugins live in
[Khirby-labs/plugins](https://github.com/Khirby-labs/plugins) (local clone under
`./plugins`). Community plugins are not published from this monorepo.
Release host packages:

```bash
./scripts/publish-plugin-packages.sh khirby-plugins@1.0.0
```

Authors install with `pnpm add @khirby/plugin-sdk @khirby/plugin-host`
(see [`packages/plugin-sdk/.npmrc.example`](../packages/plugin-sdk/.npmrc.example)).

### Community plugins

1. Build TypeScript for npm (`tsc`); ship `dist/` + `.vue` source if Vite should compile UI.
2. `peerDependencies`: `@khirby/plugin-sdk`, `@khirby/plugin-host`, Nest/Vue as needed.
3. Publish under `@khirby/*` (or your scope) with keyword `khirby-plugin`.
4. Document events used, config keys, and required CRM version / host semver.

Public registry listing is still informal (README / npm search). Do not edit
`app.module.ts` to register plugins — use the manifest.

---

## Example

See [`examples/crm-plugin-hello`](../examples/crm-plugin-hello) for a minimal
event + Nest + Vue plugin.
