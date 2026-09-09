# 0044 — Control Plane client: telemetry, marketplace catalog, npm install

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** Patryk

## Context

Khirby needs a single outbound channel to Bearly Control Plane for anonymous
usage telemetry, marketplace discovery, and community plugin submission.
Earlier decisions assumed a baked first-party plugin set (ADR-0030), boot seed
of native rows on an empty `plugins` table (ADR-0032), and a versioned JSON
document at `MARKETPLACE_CATALOG_URL` with an in-image fallback (ADR-0034).
Those no longer match an empty marketplace image that installs everything at
runtime from npm onto the instance volume.

Vue web for volume packages is covered separately by ADR-0043.

## Decision

We talk to Control Plane through one Nest client gated by **`CONTROL_PLANE_URL`**
(empty = no outbound CP traffic; register fails hard, heartbeat/catalog soft-fail).

**Telemetry:** each installation persists a UUID `installationId` and sends an
anonymous heartbeat (counts + installed plugin ids/versions). Operators opt out
with **`DISABLE_TELEMETRY`** (`true`/`1`/`yes`). Heartbeats never block boot.

**Marketplace:** the catalog is fetched from Control Plane (`/v1/marketplace/plugins`),
ordered **verified first**, then display name. The in-image catalog is **empty**.
Install resolves a version + **checksum**, downloads via npm (`pacote`), verifies
integrity (`ssri`), unpacks under `plugins/`, and **hot-loads** via
`installFromDirectory` (Nest + optional `dist/web/entry.js` per ADR-0043).

**Image / core:** `plugins.manifest.json` ships **empty** — no native seed on
boot. Core stays independent of any specific plugin; everything comes from CP
catalog + volume install (or self-build). Operators may **register** an email
and **submit** a plugin package for review through the same client.

This **partly supersedes** ADR-0030 (bake first-party into the image), ADR-0032
(seed native rows on empty table), and ADR-0034 (JSON `MARKETPLACE_CATALOG_URL`).
`MARKETPLACE_CATALOG_URL` is deprecated.

## Consequences

Easier: one Control Plane URL drives catalog, install metadata, telemetry, and
submit; empty images stay lean; verified plugins surface first.

Harder: Marketplace and install need a reachable Control Plane (or stay empty);
operators must set `CONTROL_PLANE_URL` for a useful catalog. Agents must not
reintroduce native boot seed, bake first-party plugins into the public image as
the install path, or treat `MARKETPLACE_CATALOG_URL` as the catalog source.

## Considered alternatives

- **Keep MARKETPLACE_CATALOG_URL JSON** — rejected; duplicates CP and drifts from
  verified / version / checksum metadata needed for npm install.
- **Keep native boot seed** — rejected; contradicts empty marketplace image and
  “row means installed” without implying a privileged baked set.
- **Bake first-party plugins forever** — rejected as the primary path; npm +
  volume hot-load replaces it for marketplace installs.
