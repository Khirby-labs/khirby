# 0006 — In-repo plugins and packages consumed as TypeScript source

- **Status:** Accepted (backfilled)
- **Date:** 2026-07-23
- **Deciders:** Damian

## Context

The monorepo ships first-party plugins (`plugins/crm-plugin-*`) and shared
packages (`packages/*`) that the API depends on. There are two ways to consume
them internally: import the built `dist/` artifact (requiring a build step before
the API can run or test), or import the TypeScript source directly.

## Decision

In-repo plugins and packages are **consumed directly as TypeScript source**, not
as built artifacts. `app.module.ts` imports the plugin entry point by relative
path into `src` (e.g. `../../../plugins/crm-plugin-webhook/src`). Because the
sources use ESM-style `.js` import specifiers, Jest resolves them via a
`moduleNameMapper` rule that strips the extension
(`^(\\.{1,2}/.*)\\.js$` → `$1`), and `ts-jest` compiles them on the fly.

This applies to *internal* consumption only. External landing sites consume the
`@bearly-crm/*` form packages as **published** artifacts from the GitLab Package
Registry — a separate, versioned distribution path.

## Consequences

- No build-before-run / build-before-test step for internal plugin and package
  code; a single `ts-jest`/`tsc` pass covers the whole graph.
- Import specifiers must keep explicit `.js` extensions so the same source resolves
  under both real ESM and the Jest mapper — dropping them breaks Jest resolution
  (see INCIDENTS).
- Jest `moduleNameMapper` and `roots` must include `plugins/` and the mapped
  packages; the mapper path is relative to `rootDir` (`apps/api/src`), hence the
  three-levels-up form. Do not "simplify" these away.
- External package consumers are decoupled via the registry and versioned tags —
  internal source-consumption does not leak to them.

## Considered alternatives

- **Consume built `dist/` internally** — rejected: adds a mandatory build step
  before the API can run or its tests can pass, and a stale `dist/` silently
  serves old code — a recurring, hard-to-spot failure.
- **TypeScript project references / path aliases** — rejected for now: more config
  for no gain over the direct-source + Jest-mapper approach already in place.
