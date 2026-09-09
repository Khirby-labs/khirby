# 0042 — Update checks use GitHub Releases, not Docker Hub

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** Patryk, Auto

## Context

Self-hosted operators need to see which Khirby build is running and whether a
newer release exists. The same `v*.*.*` git tag drives both the GitHub Release
and the `bearlypro/khirby` Docker Hub tag. We need one remote source for the
Settings “version” card without bloating `/api/health` (kept minimal for probes)
and without asking operators to configure a catalog URL.

## Decision

We compare the baked `APP_VERSION` (Docker build-arg from the release tag; local
`pnpm dev` falls back to `dev`) against GitHub’s
`/repos/Khirby-labs/khirby/releases/latest` from an authenticated
`GET /api/system/version`. The response is cached in-process (positive TTL one
hour, negative five minutes). Docker Hub is not queried. `/api/health` stays
`{ status: 'ok' }` only.

## Consequences

- Update detection shares the release cadence operators already follow on GitHub.
- Semver comparison is trivial (`tag_name`); no pagination or `latest` vs
  multi-arch digest noise from the Hub API.
- Forks or air-gapped installs can override `KHIRBY_RELEASES_URL` (https only) or
  live with `checkFailed` while still seeing the running version.
- Agents must not add version fields to `/api/health` or treat Docker Hub tags as
  the source of truth for this UI.

## Considered alternatives

- **Docker Hub tags API** — rejected: pagination, filtering `latest` vs `v*`,
  and weaker alignment with release notes / changelog links.
- **Client-side fetch to GitHub from the SPA** — rejected: CORS and leaking the
  check past session auth; server-side cache is shared per process.
