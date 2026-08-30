# 0040 — Ask Khirby: in-app agent is core

- **Status:** Accepted
- **Date:** 2026-08-20
- **Deciders:** Patryk
- **Pokelo ADR id:** `6e17bffa-32e2-4199-aa79-0f164dc11782` (Bearly CRM project)

## Context

Operators need an AI assistant inside the CRM for CRM data, mail, and instance-plugin
authoring — not only via external MCP clients (Cursor/Claude). A first-party chat must
not fork credentials: LLM BYOK already lives in `crm-plugin-ai-compose`, Pokelo RAG in
`crm-plugin-pokelo` (ADR-0022), and volume plugin authoring on `INSTANCE_PLUGINS`
(ADR-0038). Duplicating any of that inside a new plugin or a standalone Pokelo MCP
client would drift templates, secrets, and path guards.

## Decision

We ship **Ask Khirby** as a **core** Nest module (`apps/api/src/modules/agent/`) and Vue
surface (`AskKhirbyView`, history rail), gated by `agent:use`.

**LLM:** the agent injects `@Optional() AI_COMPOSE_LLM` from `@khirby/plugin-host`.
`crm-plugin-ai-compose` provides `{ baseUrl, apiKey, model }`. No separate agent BYOK
table or env vars. Missing/disabled AI Compose → SSE error `ai_compose_unavailable`.

**Pokelo:** `PokeloToolsAdapter` injects `@Optional() POKELO_CONTEXT_SERVICE` (ADR-0022).
When wired, the agent exposes `search_knowledge_base` and the system prompt instructs
early doc lookup. The adapter calls `fetchContext` per tool invocation — it does **not**
use AI Compose's multi-project router inside `completeChat`; the agent chooses queries
each turn.

**Instance plugins:** `PluginToolsAdapter` calls `INSTANCE_PLUGINS` (ADR-0038) for
scaffold / read / write / install / remove — same host surface as MCP, not a second fs
helper.

**CRM + mail:** tool adapters call core services in-process (contacts, leads, boards,
mail), mirroring MCP capabilities without HTTP loopback.

**Persistence:** conversation + message rows (`agent_conversations`, migration
`0009_agent_chat.sql`); streaming via SSE from `AgentChatController`.

**UI:** `/ask` routes use `layout: chat-focus` (sidebar collapse on entry); i18n
namespace `agent`. Ask appears in workspace nav and command palette only when the user
has `agent:use`.

## Consequences

**Easier:** one LLM config feeds mail assist, newsletter generate, and Ask Khirby;
Pokelo and instance-plugin authoring stay aligned with MCP; operators can self-build
plugins from the browser.

**Harder:** the agent module is core surface area — tool contracts and prompts must stay
in sync with MCP and `INSTANCE_PLUGINS`. Optional tokens mean every tool path must degrade
cleanly when a plugin is off. Agents must not add a second Pokelo client, a second
instance-plugin fs layer, or agent-specific LLM settings.

## Considered alternatives

- **Agent as an npm plugin** — rejected; chat is product core and must not depend on
  installing `crm_mcp` or similar.
- **Dedicated agent LLM settings** — rejected; duplicates AI Compose crypto and model
  allow-lists (ADR-0017).
- **MCP-only, no in-app chat** — rejected for operator UX; MCP remains a parallel
  client of the same host tokens.

## References

- ADR-0022 — optional Pokelo RAG via `POKELO_CONTEXT_SERVICE`
- ADR-0038 — instance-plugin authoring on `INSTANCE_PLUGINS`
- ADR-0017 — mail compose assistant slot / AI Compose BYOK
