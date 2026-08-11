# crm-plugin-hello

Golden-path example for a **full-stack**  Khirby CRM plugin (ADR-0016).

## What it shows

- `createPlugin()` export for the manifest loader
- Nest controller using `@crm/plugin-host` guards + `PluginEnabledGuard`
- `exports["./web"]` Vue entry (`webEntry`)
- Optional `onEvent` handler

## Try it in this monorepo

1. Add a workspace dependency (or `pnpm link`) and list it in root `plugins.manifest.json`:

```json
{ "package": "crm-plugin-hello" }
```

2. Point the package at this folder (workspace entry or path dep).
3. Run `node scripts/generate-plugin-loader.mjs`
4. Restart API and web.

Community authors outside the monorepo depend on published `@crm/plugin-sdk` and
`@crm/plugin-host` only — never on `apps/api`. Install from the GitLab Package
Registry (`.npmrc`: `packages/plugin-sdk/.npmrc.example`).
