# 0052 — Marketplace plugins are self-contained tarballs

- **Status:** Accepted
- **Date:** 2026-09-10
- **Deciders:** Patryk
- **Pokelo ADR id:** `ab5b7c3f-e338-48b2-81d3-0f8eb578b4e5` (Khirby project)
- **Amends:** [ADR-0044](0044-control-plane-telemetry-and-marketplace-client.md)

## Context

Marketplace install unpacks an npm tarball onto the instance volume (`pacote` +
`ssri`) and hot-loads it. The public image no longer vendors plugin
`node_modules` into the CRM lockfile (ADR-0044). Running `npm install` /
`pnpm add` of that tree inside a live CRM process would execute untrusted
install scripts and couple the host lockfile to every plugin’s dependency
graph. Historical docs still described community plugins as normal npm packages
with installable `dependencies`, which is the contract for **manifest / image
bake** (`pnpm sync:plugins`), not for Marketplace unpack.

## Decision

We do **not** install a plugin’s npm `dependencies` at Marketplace extract
time. A Marketplace package must ship a **self-contained runtime**: bundle
(or otherwise include) everything it needs to `require`/`import` after unpack,
except **peer** host libraries the CRM already provides (`@khirby/plugin-sdk`,
`@khirby/plugin-host`, Nest, Vue). Those stay `peerDependencies`.

## Consequences

Easier: unpack stays checksum-verify + rename; no `npm install` in the running
API; supply-chain surface stays the reviewed tarball.

Harder: authors cannot rely on `node_modules` appearing after Marketplace
install. A plugin that `require`s an undeclared SDK will fail with
`MODULE_NOT_FOUND` until it bundles that SDK. Agents must not add a
dependency-install step to `PluginPackageInstaller.extract`. Manifest-based
image plugins (`pnpm sync:plugins`) are unchanged — they still resolve through
the host lockfile.

## Considered alternatives

- **Isolated `npm install` into the unpack directory** — rejected: install
  scripts run as the API user, lockfile/ABI drift, and a second package manager
  in production.
- **Vendor plugin deps into the CRM image** — rejected; contradicts the empty
  marketplace image (ADR-0044).
