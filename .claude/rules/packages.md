---
paths:
  - packages/**
description: Shared @bearly-crm/* packages — ESM/Jest gotchas, GitLab registry publishing, tag-based versioning.
---

# Packages (packages/**) rules

The `@bearly-crm/*` packages are consumed by landing sites from the **GitLab Package Registry**.
`forms-client` and `forms-ui` are ESM (`"type": "module"`) — that drives most of the gotchas here.

## ESM + Jest
- `forms-client` / `forms-ui` run Jest in ESM mode. Test script is
  `cross-env NODE_OPTIONS=--experimental-vm-modules jest --no-coverage` — use **cross-env**, never a
  bare `NODE_OPTIONS=…` prefix (breaks on Windows).
- Relative imports in `.ts` sources must use explicit **`.js`** extensions (ESM requirement).
  Jest resolves them back via `moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" }` — keep the `.js`.
- `forms-ui` depends on `forms-client`'s built `dist/`. Its `typecheck` self-builds first
  (`pnpm --filter @bearly-crm/forms-client build && tsc --noEmit`). If forms-ui typecheck errors
  look like missing forms-client types, rebuild forms-client — the source is usually clean.

## Publishing (GitLab Package Registry)
- Publish is **tag-driven**, via `scripts/publish-forms-packages.sh` and the `publish:*` CI jobs.
  Tag formats: `crm-forms@x.y.z` (all three), or `forms-client@` / `forms-ui@` / `payload-forms@` (single).
- Bump `version` in the relevant `packages/*/package.json` **before** tagging. Working tree must be clean.
- Consumers authenticate with `GITLAB_TOKEN` against the registry — see `packages/forms-client/.npmrc.example`.

## Workspace hygiene
- Install from the **repo root** only (`pnpm add -w` or the workspace protocol) — never `pnpm add`
  inside a sub-package.
