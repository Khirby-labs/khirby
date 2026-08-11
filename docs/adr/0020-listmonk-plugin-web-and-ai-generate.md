# 0020 — Listmonk campaign UI in plugin web + AI body generate

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** team

## Context

Listmonk campaign management needed a full CRM UI (create/edit, status, stats, template
preview) and optional AI body drafting. Putting that Vue in `apps/web` would make the
host own plugin feature code (ADR-0016). Separately, mail AI suggest is thread/lead-only
and cannot produce Listmonk body fragments in html/markdown/plain/richtext.

## Decision

We ship Listmonk campaign (and lists) UI via the plugin's `./web` export
(`crm-plugin-listmonk/src/web`), registered like other plugin web entries — not as
host-owned views under `apps/web`.

We extend AI Compose with `POST /api/plugins/ai-compose/generate` (format-aware newsletter
body) gated by `@RequirePluginEnabled('crm_ai_compose')`. Listmonk's campaign editor
probes availability and only then shows generate UI; it never embeds AI provider secrets.

Campaign email preview is composed against Listmonk templates (remote preview when a
campaign id exists; otherwise local injection into `{{ template "content" . }}`).

## Consequences

**Easier:** plugin ships its own SPA surface and i18n; host only provides aliases
(`@crm/web-api`, `@crm/web-ui/*`) and Tailwind content globs for `plugins/*/src/web`.

**Harder:** preview without a saved campaign is approximate (Go template stubs); visual
Listmonk content type stays finish-in-Listmonk. Agents must not re-add Listmonk feature
views under `apps/web` — extend `plugins/crm-plugin-listmonk/src/web` instead.

## Considered alternatives

- **Host `ListmonkView` in apps/web** — rejected; violates plugin boundary (ADR-0016).
- **Reuse mail `POST .../suggest` for campaigns** — rejected; requires thread/lead and
  emits plain-text mail drafts, not Listmonk body formats.
