# ADR-0017: Mail compose assistant slot

Date: 2026-08-03
Status: Accepted
Deciders: team

## Context

The AI Compose plugin (`crm_ai_compose`) wants to inject a "Generate draft" button into
`MailThreadPanel` — the shared compose/reply surface used in lead panel, contact detail, and inbox.
No existing hook existed. Three bad options were considered:

1. **Plugin patches MailThreadPanel directly** — plugins should not import or mutate core views.
2. **Core poll for every plugin** — tight coupling; core must know every AI vendor.
3. **Full slot framework** — over-engineering for one plugin in v1.

## Decision

Core registers a thin, named assistant slot in `MailThreadPanel`.

- A module-level map `mailComposeAssistants: Record<string, () => Promise<Component>>` (parallel
  to `pluginComponentMap`) lives in `apps/web/src/plugins/plugin-registry.ts`.
- At startup the AI Compose plugin entry is added to this map (lazy import → `AiSuggestButton.vue`).
- `MailThreadPanel` iterates the map and renders each registered component above the reply textarea
  when a thread is expanded.  It passes two props:
  - `threadId: string` — currently open thread ID
  - `onSuggest: (draft: string) => void` — callback; panel places the text into `replyBody`
- The `AiSuggestButton` component calls `POST /api/plugins/ai-compose/suggest` and invokes
  `onSuggest` with the returned draft.  It **never** sends mail itself.

Human stays in control: the draft appears in the textarea; the user may edit or discard it.

## Consequences

**Good:**
- Core is ignorant of LLM providers; only knows "there are N assist components".
- Plugins cannot break compose; they only pre-fill text.
- Additional AI plugins (e.g. grammar check) can register in the same slot without core changes.

**Bad / watch-outs:**
- Multiple assistants render stacked; if many plugins register they will clutter the UI.
  A future ADR may impose ordering or a collapsible tray.

## Related

- ADR-0014: core firm mailbox (MailThreadPanel lives here)
- ADR-0016: plugin boundary (no apps/api imports from plugins)
- `packages/plugin-host/src/tokens.ts` — `MAIL_THREAD_SERVICE` bridge token added here
- `AI_COMPOSE_SECRETS_KEY` — 32-byte AES-256-GCM key required in environment;
  the plugin owns its encrypted column in `ai_compose_settings` (same shape as
  `MAIL_SECRETS_KEY` / `mail-crypto.ts`; duplicated per ADR-0016 — plugins must not import
  `apps/api`).
