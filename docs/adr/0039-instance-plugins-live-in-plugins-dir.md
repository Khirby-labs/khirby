# 0039 — Instance-authored plugins live in `plugins/`

- **Status:** Accepted
- **Date:** 2026-08-19
- **Deciders:** Patryk

## Context

ADR-0036 put self-build packages in a sibling tree (`./instance-plugins` locally,
`/data/instance-plugins` in images). First-party plugins already live in
`plugins/`. A second root meant operators and agents looked in the wrong place,
and a new plugin did not look like a plugin.

Hot-load still needs a writable directory (the image compiles first-party
sources into `apps/api/dist`; runner images do not ship `plugins/`). That
directory does not have to be a new name.

## Decision

We author and hot-load instance plugins from `plugins/<one-segment>/`, the same
folder as first-party checkouts. Locally the default is the repo `plugins/`
directory (resolved from `plugins.manifest.json` + `pnpm-workspace.yaml`).
Images set `INSTANCE_PLUGINS_DIR=/app/plugins` and bind-mount that path
(compose: host `plugins/`; Swarm: `${DATA_PATH}/plugins`).

First-party directory names (`crm-plugin-mcp`, …) are reserved. Boot scans
`plugins/` and skips those dirs plus any `createPlugin()` name already in the
image. A sidecar `instance.manifest.json` records installs; it is not the
repo-root image manifest.

## Consequences

Easier: `ls plugins/` shows MCP, Discord, and a just-scaffolded package
together; a `plugins/.git` checkout can commit the new package.

Harder: vendor (ADR-0037) must keep existing `plugins/<dir>/src` so a
self-built package is not deleted on `predev`; scaffold must refuse
first-party directory names. Swarm still pins `app` to the node that holds
`${DATA_PATH}`.

Agents must not "fix" this back into `instance-plugins/` or `/data/instance-plugins`.

## Considered alternatives

- **Keep `instance-plugins/` as a dedicated volume** — rejected; it was an extra
  location with no extra safety once first-party dirs are reserved.
- **Write into the Khirby-labs/plugins git repo only, no hot-load** — rejected;
  ADR-0036 still needs a live test without image rebuild.
