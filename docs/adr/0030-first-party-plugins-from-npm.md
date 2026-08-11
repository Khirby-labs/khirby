# 0030 — First-party plugins install from npm (out of monorepo)

- **Status:** Accepted
- **Date:** 2026-08-11
- **Deciders:** Patryk

## Context

ADR-0016 introduced `plugins.manifest.json` for community plugins while
first-party packages still lived under in-repo `plugins/` (ADR-0006). Splitting
plugin authoring into [Khirby-labs/plugins](https://github.com/Khirby-labs/plugins)
and publishing `@khirby/plugin-*` to npm means the CRM monorepo no longer owns
those sources. Docker Hub images must build without cloning that repo. A future
marketplace will install plugins at runtime; until then the public image may still
bake in the default first-party set from the manifest.

## Decision

We install first-party plugins from npm using ranges in `plugins.manifest.json`
(`pnpm sync:plugins`). They are not pnpm workspace members. For Nest compile we
vendor package `src/` into gitignored `plugins/` (ADR-0006 relative imports);
the web app depends on packages that set `"web": true` and imports `@pkg/web`.
Docker ignores host `plugins/` and vendors inside the build. Marketplace /
slim-core image work is deferred.

## Consequences

- Do not copy a host `plugins/` tree into Docker or treat first-party plugins as
  workspace packages in the CRM lockfile.
- Do edit only the manifest (plus `version` / `web`), then `pnpm sync:plugins &&
  pnpm install` — never hand-edit managed plugin lines in `apps/*/package.json`.
- Image size still includes default plugins until marketplace ships a lean core.
- ADR-0016’s “in-repo first-party” assumption is outdated; community + first-party
  share the same npm + manifest contract. ADR-0006 still describes *how* Nest
  consumes TypeScript plugin sources after vendor.

## Considered alternatives

- Keep cloning `Khirby-labs/plugins` in CI/Docker — couples public builds to a
  second private/public repo and slows Hub publishes.
- Publish precompiled `dist/` only — better long-term for marketplace; deferred
  while packages still ship `src/` and Nest vendors them.
