# 0036 — Instance-volume append-only plugin hot-load

- **Status:** Accepted
- **Date:** 2026-08-18
- **Deciders:** Patryk

## Context

Marketplace V1 (ADR-0032) installs only code already in the image: `install()` writes a `plugins` row. ADR-0016 banned unloading a Nest `DynamicModule` at runtime. Self-build needs a way for Cursor/Claude (MCP client) to author a plugin on a live instance and **test it without rebuilding the image**, without `npm publish`, and without Marketplace listing.

Loading arbitrary TypeScript from a writable directory is in-process execution (same trust model as an npm plugin). Vue `exports["./web"]` is generated into the SPA at build time and cannot appear after a hot-load.

## Decision

We load operator-authored plugins from `INSTANCE_PLUGINS_DIR` (`/data/instance-plugins` in images, `./instance-plugins` locally). Boot concatenates the image list with `jiti`+`createPlugin()` packages listed in that volume's `plugins.manifest.json`. The `CRM_PLUGINS` array stays the same reference so a later `push` is visible to `emit()`.

Hot-load is **append-only**: write files, append the instance manifest, `jiti`, `push`, Nest `LazyModuleLoader` when `getNestModule()` exists, then the existing `install()`/`activate()` path. We never unload. `install_instance_plugin` rejects `exports["./web"]`. Templates use bare `@khirby/plugin-sdk` / `@khirby/plugin-host` (volume packages are not compiled into `apps/api/dist`).

This does **not** amend ADR-0034's catalog availability filter. A hot-loaded plugin may show as Marketplace `other` via the existing process ∪ catalog union; first-class listing is a later ticket.

## Consequences

Easier: an agent with an MCP bearer can scaffold, validate, and test an API-only plugin on this instance; restart survives via the volume.

Harder: no Vue UI until the image is rebuilt; no unload (a bad plugin stays until process restart + removing the volume entry); Swarm must pin `app` to the node that holds `${DATA_PATH}` because the volume is a host bind-mount. `jiti` is a production dependency of `apps/api`.

Agents must not "fix" this into module unload, SPA hot-load, or routing codegen through AI Compose.

## Considered alternatives

- **Generator-only (zip / PR), no runtime load** — rejected for this ticket; the operator cannot test events/Settings on the live instance.
- **`pnpm add` into `apps/api`** — dirty lockfile / image; INCIDENTS 2026-08-17.
- **A2A instead of MCP** — MCP already ships; A2A is a later wrap of the same host methods.
