# 0023 — Settings-only plugin UIs embed in Settings → Plugins

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** Damian Orzeł, Auto
- **Pokelo ADR id:** `533270aa-1791-44d1-9cea-babab6564160` (Bearly CRM project)

## Context

Some first-party plugins need interactive settings (bearer token rotate/reveal,
encrypted API keys, remote project pickers) that do not fit `getConfigSchema()` /
`PluginConfigForm`. MCP, AI Compose and Pokelo each shipped a full Vue page via
`getFrontendRoutes()`, which put them in the sidebar **Plugins** group next to
operational tools (Task board, Newsletter). Operators then had two places that
looked like “plugin settings”: the Settings console card (toggle only) and a
sidebar page. ADR-0008 already put administration under Settings; settings-only
plugin screens contradict that IA.

## Decision

We keep custom settings components for those plugins, but mount them **inside**
the Settings → Plugins expand panel (same “Konfiguruj” affordance as schema
forms). Those plugins do **not** declare `getFrontendRoutes()`. The SPA maps
plugin names to panels in `pluginSettingsPanels`. Operational plugin routes
(Task board, Newsletter) still use `getFrontendRoutes()` and remain in the
sidebar. `PluginFrontendRoute.showInNav` (default true) lets a future hybrid
register a route without a nav entry.

## Consequences

- Do not add settings-only plugins to the sidebar Plugins group — embed under
  Settings → Plugins instead.
- Do not force interactive secret/token UIs into `getConfigSchema()` just to get
  a Configure button; use a custom panel in `pluginSettingsPanels`.
- Old paths `/plugins/mcp`, `/plugins/ai-compose`, `/plugins/pokelo` redirect to
  `/settings/integrations`.
- Custom panel APIs that use `PluginEnabledGuard` only work when the plugin is
  on; the panel shows an enable hint while it is off.

## Considered alternatives (optional)

- **Konfiguruj → navigate to a dedicated page, hide from nav** — rejected: the
  forms are small enough for the existing expand panel and a second page added
  navigation without value.
- **Squash everything into `PluginConfigForm`** — rejected: token reveal,
  encrypted secrets and live remote pickers are not static schema fields
  (ADR-0013, ADR-0022).
