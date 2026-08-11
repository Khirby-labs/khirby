# 0029 — Public product docs live on the landing site

- **Status:** Accepted
- **Date:** 2026-08-07
- **Deciders:** Damian

## Context

ADR-0015 put a VitePress app in this monorepo (`apps/docs`) and served it from the CRM image at `/docs/`, so operators and plugin authors had same-origin docs. Public product documentation now lives in the landing-site repository instead. Keeping a second VitePress tree here duplicated content, inflated the production image, and forced nginx/Vite proxy wiring that no longer matches where readers look.

## Decision

We **remove** in-repo public docs (`apps/docs`) and stop serving `/docs/` from the CRM nginx image. Public product documentation is published from the landing repository. This repo keeps only the internal `docs/` tree (ADRs, journal, design system, deploy runbooks).

## Consequences

- `pnpm dev` / Docker builds no longer run VitePress; SPA Vite proxy and nginx `location /docs/` are gone.
- Self-hosted Compose examples stay in [`docs/DEPLOY.md`](../DEPLOY.md) (internal), not in a public site under this image.
- Do not reintroduce `apps/docs` or a `/docs` static mount without a new ADR — point readers at the landing docs instead.
- Swagger remains at `/api/docs` (dev only) and is unrelated.

## Considered alternatives (optional)

- **Keep VitePress here and redirect `/docs` to the landing site** — rejected: dead weight in the CRM image for a path we no longer own.
- **Symlink or publish root `docs/`** — still rejected (same reasons as ADR-0015): internal agent/journal content is not product docs.
