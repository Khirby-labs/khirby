# 0013 — MCP plugin with hashed bearer tokens (no OAuth yet)

- **Status:** Accepted
- **Date:** 2026-07-29
- **Deciders:** Damian

## Context

External AI agents (Claude Code, Cursor, Hermes, and similar) need machine access to
CRM data. The API today authenticates only via Redis session cookies (ADR-0002), which
are a poor fit for headless MCP clients. The MCP specification prefers OAuth 2.1 for
remote HTTP servers, but shipping OAuth for a single-tenant self-hosted CRM is a large
surface for the first integration.

## Decision

We expose a **read-only MCP server** as an in-repo plugin (`crm-plugin-mcp`) over
**Streamable HTTP** at `/api/mcp`, using the official MCP TypeScript SDK v2
(`@modelcontextprotocol/server` + `@modelcontextprotocol/node`).

Authentication for v1 is a **single operator-generated bearer access token**:
generate/rotate in the plugin UI, plaintext shown once, **bcrypt hash** stored in a
plugin-owned table (`mcp_access_tokens`). Clients send `Authorization: Bearer <token>`.
OAuth 2.1 / Protected Resource Metadata is deferred.

Tools call existing Nest services (`ContactsService`, `LeadsService`,
`PipelineStagesService`) — no duplicated SQL. Write/delete tools are out of scope for v1.

## Consequences

- Agents connect with a static bearer header (Claude Code `--header`, Cursor `.mcp.json`).
- Token compromise means full read access to contacts and leads until rotate/revoke;
  treat the token like a password.
- Nest `SessionGuard` does not apply to `/api/mcp`; auth is verified in the plugin's
  Fastify mount. CORS for `/api/mcp` allows `Authorization` without credentials.
- Plugin disable or missing token yields `503`; bad/missing bearer yields `401`.
- Future OAuth can sit in front of the same tool handlers without changing the CRM
  domain layer; do not invent a parallel JWT/session path for agents.

## Considered alternatives

- **OAuth 2.1 first** — rejected for v1 scope; revisit when multi-client / per-user
  agent consent is needed.
- **Store token plaintext in `plugins.config`** — rejected: `GET /api/plugins` returns
  full config to anyone with `integrations:manage`.
- **stdio-only MCP** — rejected: self-hosted CRM is reached over the network by remote
  agents; Streamable HTTP is the right transport.
