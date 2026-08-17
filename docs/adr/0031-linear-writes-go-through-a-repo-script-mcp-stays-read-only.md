# 0031 — Linear writes go through a repo script, MCP stays read-only

- **Status:** Accepted
- **Date:** 2026-08-17
- **Deciders:** Damian Orzeł

## Context

Tasks live in Linear, so `/task` and `/wrap` must read an issue, post a comment and move
a status. That path had never actually run: all 15 devlog entries carry `Issue: —`.

Three facts made it unrunnable. `.mcp.json` pointed at `https://mcp.linear.app/sse`, which
now returns 404 — Linear is removing SSE in favour of `/mcp`. Both Linear MCP servers
available here require an interactive OAuth flow, so they are dead in hooks, fan-out
worktrees, cron and CI. And the MCP tool names are documented nowhere:
`linear.app/developers/mcp` is 404 and `tools/list` answers 401 without auth — yet `/task`
and `/wrap` were written against `get_issue`, `save_issue`, `save_comment` and
`list_issue_statuses`, names nobody could verify.

An agentic intake flow that creates issues on its own turns an auditable, non-interactive
write path from a convenience into a requirement.

## Decision

Every Linear write goes through `.claude/scripts/linear.mjs` — GraphQL against
`https://api.linear.app/graphql` with a personal API key (raw `Authorization` header; the
`Bearer` form is for OAuth tokens). The script reads `LINEAR_API_KEY` from `.env` itself, so
`Read(.env*)` stays denied and the key never enters an agent's context.

Writes are pinned to one team, declared in the committed `.claude/linear.json`. A write that
resolves to any other team is refused, so even a wider-scoped key cannot reach further; the
key is additionally limited to that team in Linear itself.

`.mcp.json` points at `https://mcp.linear.app/mcp/readonly`. The rule "MCP does not write"
is therefore enforced by the server, not by prompt discipline.

Statuses and labels are never hardcoded. They are resolved by name or category from a cached
`meta` snapshot, and an unknown name exits 1 printing the team's real list — the team this
was built against, for instance, has no "In Review" state at all.

## Consequences

Easier: `/task` and `/wrap` work headless, so hooks, worktrees and CI can drive them. Every
Linear write is a reviewable shell command with a `--dry-run`. The blast radius of a leaked
key is one team. Intake can create a parent plus sub-issues deterministically via
`issueCreate` + `issueBatchCreate`.

Harder: anything exposed only through MCP (initiatives, project milestones, project updates)
now needs a new GraphQL command instead of arriving for free. The script is ours to maintain
against Linear's schema, and a breaking change shows up as a runtime GraphQL error rather
than a typecheck failure. Each developer pays a one-time setup: a personal API key with
Read + Write, limited to the team, in `.env`.

## Considered alternatives

**Full MCP (`/mcp`, write-capable).** Rejected: interactive OAuth kills headless use, the
tool names cannot be verified, and it would open a second write path that the team pin does
not govern.

**Official `@linear/sdk`.** Rejected: a dependency to obtain what six GraphQL documents
already do; the script stays zero-dep on Node 22 (`process.loadEnvFile`, `fetch`).

**Drop `.mcp.json` entirely.** Rejected: once the write path is closed, a read-only MCP
server is genuinely useful for interactive browsing and costs nothing.
