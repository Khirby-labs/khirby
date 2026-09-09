# 0043 — Volume plugin Vue web hot-load via dist/web/entry.js

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** Patryk

## Context

ADR-0036 banned `exports["./web"]` on instance-volume packages because the SPA
merged Vue at image build time. Marketplace and self-build plugins still need a
real Vue UI without rebuilding the host SPA. A prebuilt ESM bundle on the volume
can be served and dynamic-imported if the host shares Vue peers.

## Decision

We allow volume/marketplace packages to declare `exports["./web"]` when
`dist/web/entry.js` exists on disk. Hot-load / `installFromDirectory` reject
`./web` without that file (`web_bundle_required`). The API serves
`GET /api/plugins/:name/web/*` from the package `dist/web/` (session auth,
path-traversal safe). `findAll` exposes optional `webBundleUrl` +
`webBundleVersion`. The SPA sets `window.__KHIRBY__` peers, ships
`/khirby-peers/*` import-map shims, and `registerPluginRoutes` dynamic-imports
the bundle when `webBundleUrl` is present (else `InstancePluginView`).

This **supersedes the ADR-0036 ban on `exports["./web"]`** only; append-only
Nest hot-load and the rest of 0036 remain.

## Consequences

Easier: volume plugins can ship Vue without an image rebuild.

Harder: plugin authors must externalize `vue` / `vue-router` / `vue-i18n` to the
host import map. Common `@khirby/web-ui/*` paths (`AppTable`, `AppModal`,
`AppSelect`, `AppDatePicker`, `useConfirm`) are exposed via
`window.__KHIRBY__.webUi` and `/khirby-peers/web-ui-*.js` shims; other web-ui
exports are not on the map yet — stay on InstancePluginView or add a shim.
Agents must not claim Vue is banned on the volume.

## Considered alternatives

- **Keep InstancePluginView only** — rejected; marketplace UIs need custom Vue.
- **Rebuild SPA on install** — rejected; defeats hot-load.
