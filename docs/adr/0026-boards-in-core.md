# 0026 — Work boards are core; sales pipeline stays domain-specific

- **Status:** Accepted
- **Date:** 2026-08-07
- **Deciders:** Damian Orzeł
- **Pokelo ADR id:** `b14a7133-a003-4378-8e0e-23b5deaf6126` (Bearly CRM project)

## Context

The CRM had two independent kanban systems: a core sales pipeline (`pipeline_stages` +
`leads`) and a first-party plugin taskboard (`tb_*` tables, `/api/taskboard`, optional
plugin nav). Operators treat work boards as day-to-day CRM surface (alongside Pipeline),
not as an optional integration. Markdown on cards is already authored in the CRM; Pokelo
is a separate RAG product with read-only CRM integration today (ADR-0022 / ADR-0024).
Multi-brand tracking for one org does not require multi-tenancy (ADR-0004).

## Decision

We promote the work taskboard into **core** as the **Boards** module (schema in
`schema.ts`, Nest `BoardsModule`, Workspace nav, RBAC resource `boards`). The sales
pipeline remains a **separate domain model** — leads are not cards on a generic board.
Card markdown lives in the CRM as source of truth; Pokelo indexing/sync is deferred
(nullable `pokelo_document_id` on cards reserves the V2 link). Multi-brand use in V1 is
the convention **one board = one brand** — no `tenant_id`, no brand switcher.

## Consequences

- Do not reintroduce work boards as a plugin; operational UI belongs in Workspace nav
  (ADR-0008 / ADR-0023).
- Do not collapse `leads` / `pipeline_stages` onto the Boards card model to “unify”
  kanban — share UI shell later if needed, not the data model.
- Do not add multi-tenancy to support multiple brands; use separate boards (and a future
  Brand/Space epic only if the convention fails).
- Do not treat Pokelo as the markdown store for cards in V1; sync via MCP write tools is
  a later step when indexing is required.
- Permission resource renames from `taskboard` → `boards`; API prefix `/api/boards`.

## Considered alternatives (optional)

- **Keep as plugin** — rejected: first-party ops surface with CRM user/lead links is core.
- **One generic Board engine for leads + tasks** — rejected for V1: sales needs won/lost,
  value, mail hints; collapsing domains adds migration risk without product win.
- **Spin Boards out as a separate Bearly product** — rejected for now: same session, users,
  and lead links; extractable package boundary is enough if GTM ever demands a split.
- **Pokelo as markdown source of truth** — rejected for V1: CRM already owns card bodies;
  Pokelo remains RAG/docs.
