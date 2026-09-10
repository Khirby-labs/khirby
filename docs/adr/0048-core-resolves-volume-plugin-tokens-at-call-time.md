# 0048 — Core resolves volume-plugin host tokens at call time

- **Status:** Accepted — `resolveLoadedProvider` lives on `@khirby/plugin-host`; Compose call-time resolve covered by [ADR-0050](0050-ask-khirby-proxies-full-pokelo-mcp-tools.md)
- **Date:** 2026-09-09
- **Deciders:** Patryk
- **Pokelo ADR id:** `376ddb72-b92e-4dd4-94fc-8e62d00b4de0` (Khirby / Bearly CRM project)

## Context

Ask Khirby (ADR-0040) and knowledge tools (ADR-0047) inject host tokens
(`AI_COMPOSE_LLM`, `KNOWLEDGE_CONTEXT`) with `@Optional()` on the **constructor**.
That works when the providing Nest module is imported at boot — the old
in-image plugin path.

The public image now ships an empty `plugins.manifest.json` (ADR-0044).
AI Compose and Pokelo load from the instance volume via `LazyModuleLoader`
(ADR-0036) **after** core providers are constructed. Constructor `@Optional()`
then freezes as `null` for the process lifetime. Settings HTTP still works
(those controllers live on the volume module / HTTP bridge), so the UI shows
a configured API key while Ask Khirby emits `ai_compose_unavailable`.

## Decision

Consumers of tokens **provided by volume plugins** resolve them at **call
time** through `resolveLoadedProvider` on `@khirby/plugin-host` (ModuleRef +
container walk), not constructor inject — including core Ask Khirby **and**
sibling volume plugins such as AI Compose resolving `KNOWLEDGE_CONTEXT`.
Image-provided tokens may still use constructor inject.

## Consequences

**Easier:** Ask Khirby and knowledge tools see BYOK / RAG after a
Marketplace install without putting those plugins back in the image.

**Harder:** a constructor `@Optional() @Inject(AI_COMPOSE_LLM)` or
`@Inject(KNOWLEDGE_CONTEXT)` when the provider may be a volume sibling is a
bug waiting to look like “not configured”. Do not “fix” this by
importing volume Nest modules in `PluginsModule.forRoot` — that reopens
irreplaceable Fastify routes (ADR-0036).

Amends the inject *timing* in ADR-0040 and ADR-0047; the tokens themselves stay.

## Considered alternatives

- **Import volume Nest modules in `PluginsModule.forRoot`** — rejected; Fastify
  5 cannot replace those routes on reload.
- **Dedicated agent BYOK settings** — rejected; duplicates AI Compose (ADR-0040).
