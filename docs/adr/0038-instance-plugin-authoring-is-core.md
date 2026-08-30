# 0038 — Instance-plugin authoring lives in core

- **Status:** Accepted
- **Date:** 2026-08-19
- **Deciders:** Patryk

## Context

ADR-0036 put hot-load on the instance volume so an operator can test a plugin
without rebuilding the image. The first client was MCP (Cursor/Claude). In-app
chat is a new **core** surface that will author plugins the same way.

If scaffold, path caps, and the contract text live only in `@khirby/plugin-mcp`,
chat cannot call them without importing that plugin, and the two clients will
fork templates and `..` rules. Cursor's editor Write on the volume is a third
write path that bypasses those rules.

## Decision

We keep instance-plugin authoring on the host: `PluginRegistryService` behind
`INSTANCE_PLUGINS` (`scaffold`, `writeFile`, `readFile`, `listFiles`,
`pluginContract`, `packageDir`, plus the existing `validate` / `hotLoad` /
`appendManifest`). MCP and in-app chat are clients of that token. They must not
reimplement file ops, templates, or reserved-name checks.

## Consequences

Easier: one skeleton, one 24-file / 100KB cap, one reserved-name list; chat and
MCP stay in sync when the contract changes.

Harder: `@khirby/plugin-host`'s `InstancePluginsLike` surface grows; an MCP
plugin built against an older host lacks the methods. Volume writes go through
the host — not Cursor Write, not a second fs helper in the plugin.

Agents must not "fix" this by moving scaffold back into `crm-plugin-mcp` or by
teaching chat to import the MCP plugin for file ops.

## Considered alternatives

- **Authoring only in the MCP plugin** — rejected; chat is core and must not
  depend on `crm_mcp` being installed.
- **A shared package in Khirby-labs/plugins** — rejected; the host already
  owns the volume and hot-load.
- **REST authoring routes in addition to the token** — not required for MCP or
  an in-process chat module; add later if a remote client needs HTTP.
