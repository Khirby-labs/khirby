# 0015 — Public VitePress docs vs internal `docs/`

- **Status:** Superseded by ADR-0029
- **Date:** 2026-08-03
- **Deciders:** Damian

## Context

We need public technical documentation for operators and plugin authors, served under `/docs` from the same production image as the SPA. The repository already has a `docs/` tree used as an internal knowledge base for humans and agents (ADRs, journal, incidents, design system, deploy runbooks). Publishing that tree as-is would expose agent process notes, traps, and decisions that are not product documentation.

## Decision

We publish a **separate** VitePress app at `apps/docs`, built into static files and served by nginx at `/docs/`. The existing root `docs/` directory stays **internal** (repo-only; not copied into the image as the public site).

Agents and contributors must not symlink or mirror ADR / journal / INCIDENTS / DESIGN-SYSTEM into `apps/docs` without an explicit curation pass.

## Consequences

- Public docs and agent memory evolve independently; duplication of high-level architecture is acceptable.
- `pnpm dev` runs VitePress alongside API + web; the SPA Vite proxy forwards `/docs` so local URL shape matches production.
- Bundle and web Docker images copy `apps/docs/.vitepress/dist` → `/usr/share/nginx/html/docs`.
- Swagger remains at `/api/docs` (dev only) and is unrelated to the public site.

## Considered alternatives (optional)

- **Publish root `docs/` via VitePress** — rejected: mixes internal agent/journal content with public product docs.
- **Separate docs subdomain / service** — rejected: one image and same-origin `/docs` keep deploy and CORS simple.
