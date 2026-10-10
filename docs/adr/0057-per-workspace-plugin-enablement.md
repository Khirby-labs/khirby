# 0057 — Per-workspace plugin enablement; owner-only marketplace

- **Status:** Accepted
- **Date:** 2026-10-10
- **Deciders:** Damian
- **Pokelo ADR id:** `4034dc5f-c227-4f79-9a63-861a8f6fcefd` (Khirby project)

## Context

Marketplace install is instance-global (one Nest process, one `plugins` row). Under
Enterprise Multi-Workspace (ADR-0055), firms must not share Listmonk credentials or
see each other’s plugin toggles. Only the workspace **owner** should install,
enable, and configure plugins or open the Marketplace.

## Decision

**Install stays instance-global.** **Enable + config are per workspace** via
`mw_workspace_plugins` and host token `PLUGIN_SCOPE_POLICY` (registered by the
Multi-Workspace plugin). HTTP `PluginEnabledGuard` / the instance HTTP bridge use
`isEnabledAsync` (Nest loaded ∧ workspace enabled). Settings enable/disable/config
and Marketplace routes require `PluginScopeAdminGuard` (active workspace owner).
Community (no policy) is unchanged: `integrations:manage` + instance `plugins.enabled`.

`crm_multi_workspace` itself cannot be disabled per workspace. Mailbox-per-scope
remains ADR-0056.

## Consequences

- Easier: one Marketplace unpack; each firm turns on Listmonk with its own URL/API key.
- Harder: Nest stays loaded while any workspace may use the plugin; emit() still uses
  the last context config — call-time `findByName` must supply scoped config (Listmonk
  already does).
- **Do not** unload Nest on workspace disable.
- **Do** gate Marketplace + Settings → Integrations on `scope.canManagePlugins`.

## Considered alternatives

- **Install per workspace (duplicate unpacks)** — rejected: disk and Nest module cost.
- **RBAC resource `plugins:manage`** — rejected for v1: ownership is workspace-scoped,
  not a global role bit.
