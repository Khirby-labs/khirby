# 0022 — Optional Pokelo RAG context via plugin-host token

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** team
- **Pokelo ADR id:** `06d2d2ed-0572-42c5-bd53-36f5bd94663e` (Bearly CRM project)

## Context

AI Compose drafts mail replies and Listmonk campaign bodies. Firm knowledge lives in
Pokelo (RAG). Hard-wiring Pokelo into AI Compose (or Listmonk) would couple plugins and
break when Pokelo is absent. Host→plugin tokens already exist (ADR-0016); there was no
pattern for optional **plugin→plugin** services. Nest loads plugin modules as siblings
under `PluginsModule` without re-exporting their providers.

## Decision

We add `POKELO_CONTEXT_SERVICE` / `PokeloContextServiceLike` to `@khirby/plugin-host`.
`crm-plugin-pokelo` registers the implementation on a `@Global()` Nest module and exports
the token. AI Compose injects it with `@Optional()` and enriches every LLM call inside
`completeChat` (mail suggest and newsletter generate). Missing provider or empty
`fetchContext` means prior behaviour.

With multiple projects bound in settings, AI Compose searches **1–2** projects directly;
with **3+** it runs a cheap router call (same `chat/completions` shape as draft) to pick
primary (+ optional follow-up) projects before RAG. Snippets are labeled with project
names.

Ask Khirby (in-app agent) is a separate consumer — see ADR-0040.

## Consequences

**Easier:** one or more firm Pokelo projects in settings feed all AI Compose surfaces;
Listmonk needs no RAG client. New AI callers that go through `completeChat` inherit
context.

**Harder:** Pokelo's Nest module must stay `@Global()` (sibling DI otherwise fails).
Disabling the plugin in the UI does not remove the provider — `fetchContext` must return
`''` when disabled or unconfigured. Agents must not import Pokelo from AI Compose; only
the host token. Multi-project routing in AI Compose adds one extra LLM call when **3+**
projects are bound (not at 2).

## Considered alternatives

- **RAG only in `suggest()`** — rejected; misses Listmonk `/generate`.
- **Listmonk calls Pokelo directly** — rejected; duplicates secrets and MCP client.
- **Re-export all plugin modules from PluginsModule** — heavier; `@Global()` on the
  provider is enough for this optional token.
