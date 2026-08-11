# 0024 — Pokelo settings: encrypted token and multi-project binding

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** Damian Orzeł, Auto
- **Pokelo ADR id:** `d14fd9b5-9780-40a3-8711-a0c09747b700` (Bearly CRM project)

## Context

Bearly CRM needs a secure and flexible way to store Pokelo plugin settings. The
Pokelo API token must not be stored in `plugins.config` JSONB, because
`GET /api/plugins` exposes full plugin config to users with `integrations:manage`.
The plugin also needs multi-project support, not a single `project_id`, and the
operator UI must follow ADR-0023: **Settings → Plugins** expand panel, not the
sidebar and not `getConfigSchema()`.

This ADR complements ADR-0022 (`POKELO_CONTEXT_SERVICE` into AI Compose). This
decision is specifically about secrets storage and project binding.

## Decision

We store Pokelo settings in a plugin-owned table `pokelo_settings`, not in
`plugins.config`.

The table stores:

- `encrypted_token` — AES-256-GCM
- key from env `POKELO_SECRETS_KEY`
- `baseUrl`
- `project_ids` text array (multi-project)
- `project_id` only as a legacy migration field

The Settings API never returns the plaintext token — only `tokenConfigured`.
Operator UI lives in Settings → Plugins as an expand panel (ADR-0023).

## Consequences

**Easier:** credentials are not exposed on plugin list GET; multi-project binding
works; secret handling matches other encrypted plugin settings; UI stays under
Settings.

**Harder:** dedicated settings table + crypto; migrate legacy `project_id`;
`POKELO_SECRETS_KEY` required to save a token. Do not put the Pokelo token in
`plugins.config`. Do not reintroduce a sidebar-only Pokelo settings route.

## Considered alternatives

- **Token in `plugins.config` JSONB** — rejected: leaks via `GET /api/plugins`.
- **Single `project_id` only** — rejected: multi-project is required.
- **Static `getConfigSchema()` for token and projects** — rejected: interactive
  picker after token save; panel under Plugins settings (ADR-0023).
- **Plaintext token in DB** — rejected: secrets encrypted at rest.

## References

- ADR-0014 — encrypted columns, reject `plugins.config` for secrets
- ADR-0022 — optional Pokelo RAG context via plugin-host token
- ADR-0023 — settings-only UIs embed in Settings → Plugins
