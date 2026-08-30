# 0037 — Hybrid plugin vendor: keep local sources, npm-fill gaps

- **Status:** Accepted
- **Date:** 2026-08-18
- **Deciders:** Patryk

## Context

ADR-0030 vendors first-party plugin `src/` from npm into gitignored `plugins/` so Nest can compile without a Khirby-labs/plugins checkout. The vendor step ran on every `pnpm --filter api dev` (`predev`) and **deleted** each `plugins/crm-plugin-*` before copying from `node_modules`. A tree without `plugins/.git` (the usual vendored layout) was treated as disposable cache.

That is wrong for two jobs that share the same directory: filling gaps so a clone without the plugins repo still builds, and editing a plugin that already lives there (KBY-120's MCP tools lived only in `plugins/crm-plugin-mcp` and vanished on API restart while host code in `apps/api` survived).

## Decision

**Vendor is hybrid per package.** If `plugins/<dir>/src` already exists, we keep it. We copy from npm only when that directory is missing. `KHIRBY_PLUGINS_WORKSPACE=1` or a `plugins/.git` checkout is **local-only**: skip npm vendor entirely (a missing package is a checkout problem, not a cue to mix in a registry copy).

To pick up a newer npm version of a kept directory, delete `plugins/<dir>` and re-run `pnpm sync:plugins` / `predev`.

## Consequences

Easier: local edits in `plugins/` survive `pnpm dev`; a fresh CI/Docker tree still vendors everything from npm (`plugins/` is gitignored and dockerignored).

Harder: a kept directory can drift behind the manifest range until someone deletes it. The vendor log prints on-disk vs npm versions when they differ. Agents must not "fix" this back into an unconditional `rmSync` of `plugins/crm-plugin-*`.

## Considered alternatives

- **All-or-nothing skip only when `plugins/.git` exists** (previous) — a vendored-then-edited tree has no `.git`, so every restart wiped it.
- **Always refresh vendor stubs, keep only full checkout package.json** — our edits sat *inside* a stub tree; that rule would still delete them.
- **Version-compare overwrite** — silent data loss whenever npm ticks; refresh stays an explicit delete.
