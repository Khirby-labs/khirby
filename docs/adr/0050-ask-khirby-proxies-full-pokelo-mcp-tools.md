# 0050 — Ask Khirby proxies full Pokelo MCP tools; Compose keeps fetchContext

- **Status:** Accepted
- **Date:** 2026-09-10
- **Deciders:** Patryk
- **Pokelo ADR id:** `d7c38ea4-24e3-43f3-a865-d0954eaf1eb3` (Khirby project)
- **Amends:** [ADR-0047](0047-knowledge-context-token.md), [ADR-0048](0048-core-resolves-volume-plugin-tokens-at-call-time.md)

## Context

Ask Khirby exposed only curated wrappers (`search_knowledge_base`) while Pokelo MCP
ships a full `tools/list` catalog (~23 tools). Operators bind several projects in
Settings, but the agent could not list or browse them like a real MCP client. AI
Compose and Listmonk (via Compose `/generate`) still injected `KNOWLEDGE_CONTEXT` on
the constructor — broken when Pokelo is a volume plugin (ADR-0048). Leaving Compose
on a separate stack would be durable dual-path debt.

## Decision

We add `KNOWLEDGE_TOOLS` / `KnowledgeToolsLike` (`listTools` + `callTool`) on
`@khirby/plugin-host`. `crm-plugin-pokelo` implements it by proxying Pokelo MCP
`tools/list` and `tools/call` through one shared HTTP client also used by
`fetchContext`. Bound `project_ids` are a hard ACL; `create_project` is blocked
(binding stays in Settings). Ask Khirby maps `listTools()` to LLM tool definitions.

AI Compose resolves `KNOWLEDGE_CONTEXT` at **call time** via `resolveLoadedProvider`
(moved to plugin-host) and still only calls `fetchContext(query)` for enrichment —
no MCP tool loop in mail/newsletter draft. Listmonk keeps calling Compose
`/generate` with no second RAG client.

## Consequences

**Easier:** Ask sees the live Pokelo catalog as tools are added upstream; multi-project
binding is enforceable; Compose/Listmonk share the same MCP transport; volume install
order no longer nulls Compose RAG.

**Harder:** users with `agent:use` inherit write tools on bound projects via the
instance MCP token. Do not reintroduce curated `search_knowledge_base` wrappers. Do
not constructor-`@Optional()` `KNOWLEDGE_CONTEXT` in Compose. Do not add a Pokelo
client inside Listmonk.

## Considered alternatives

- **Curated list/search tools only** — rejected; drifts from MCP and cannot browse.
- **Agentic Compose with full MCP tools** — rejected; mail/newsletter stay single-shot.
- **Leave Compose on constructor inject** — rejected; volume plugins stay invisible (ADR-0048).

## References

- ADR-0040 — Ask Khirby core agent
- ADR-0047 — `KNOWLEDGE_CONTEXT` enrichment token
- ADR-0048 — call-time resolve for volume-plugin tokens
- ADR-0024 — multi-project Pokelo settings binding
