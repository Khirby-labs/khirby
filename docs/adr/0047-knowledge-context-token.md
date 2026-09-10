# 0047 — Generic knowledge-context token (AI Compose does not know Pokelo)

- **Status:** Accepted — Ask surface amended by [ADR-0050](0050-ask-khirby-proxies-full-pokelo-mcp-tools.md) (`KNOWLEDGE_TOOLS` MCP proxy)
- **Date:** 2026-09-09
- **Deciders:** Patryk
- **Pokelo ADR id:** `816c41fe-a257-4bab-8c51-e18c769acc0c` (Bearly CRM / Khirby project)
- **Supersedes:** [ADR-0022](0022-pokelo-rag-context-token.md)

## Context

ADR-0022 put a Pokelo-named token on `@khirby/plugin-host` and made AI Compose the
consumer that listed bound projects and ran a multi-project LLM router before RAG.
That is plugin→plugin coupling: the BYOK LLM plugin had to know Pokelo exists, how
projects are bound, and how to pick them. A second knowledge plugin could not provide
the same enrichment. Ask Khirby already treated the surface as `search_knowledge_base`;
compose did not.

Pokelo's own `fetchContext(query)` already searches every bound project when callers
do not pass `projectIds`. The router in AI Compose was extra work on the wrong side
of the boundary.

## Decision

We add `KNOWLEDGE_CONTEXT` / `KnowledgeContextLike` to `@khirby/plugin-host` with
`fetchContext(query, opts?)` (optional `projectIds` scope). `crm-plugin-pokelo`
registers the implementation on its `@Global()` module. AI Compose resolves it at
call time and appends snippets from `fetchContext(query)` only — it must not list
projects or run an LLM router.

Ask Khirby's tool surface for browsing/searching knowledge is defined in ADR-0050
(`KNOWLEDGE_TOOLS` — full MCP proxy), not curated wrappers on this token.

`POKELO_CONTEXT_SERVICE` remains a deprecated second provide of the same class until
published plugins that still register the old token are bumped.

## Consequences

**Easier:** AI Compose is only BYOK + draft/generate. Another knowledge plugin can
implement the same enrichment token. Multi-project search stays where the credentials
and MCP client already live.

**Harder:** a published Pokelo that only `provide`s `POKELO_CONTEXT_SERVICE` will not
enrich a compose plugin that only injects `KNOWLEDGE_CONTEXT` until that Pokelo
build is updated. Do not add Pokelo types or project routing back into
`crm-plugin-ai-compose`. Do not add a second RAG client in Listmonk. Do not
reintroduce an LLM project-router in AI Compose.

## Considered alternatives

- **Keep `POKELO_CONTEXT_SERVICE` but slim the interface** — rejected; the host
  contract would still name a vendor.
- **Host interceptor around every LLM call** — heavier; optional token injection
  is the existing plugin pattern (ADR-0016).
- **Move the LLM router into Pokelo via `AI_COMPOSE_LLM`** — unnecessary;
  `fetchContext` already searches all bound projects.

## References

- ADR-0016 — plugins talk to the host, not to sibling plugins by name
- ADR-0017 — AI Compose is the mail assistant / BYOK plugin
- ADR-0022 — superseded Pokelo-named token + compose-side router
- ADR-0040 — Ask Khirby consumes knowledge tokens
- ADR-0050 — Ask proxies full Pokelo MCP via `KNOWLEDGE_TOOLS`
