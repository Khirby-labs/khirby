# 0019 — MCP mail tools (read threads + attributed send/reply)

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** Damian

## Context

ADR-0013 shipped a read-only MCP surface for contacts and leads. Agents still could
not see firm-mailbox threads (including newly ingested inbound mail) or send
replies, so CRM correspondence stayed invisible to MCP clients. Outbound
`MailSendService` requires a `sentByUserId`; the MCP bearer token has no user
identity (ADR-0013).

## Decision

We expose email on the MCP plugin via host bridges `MAIL_THREAD_SERVICE` and
`MAIL_SEND_SERVICE`:

- **Read:** `list_email_threads`, `get_email_thread` (full message list with
  `bodyText`; HTML stays omitted per ADR-0014).
- **Write:** `send_email`, `reply_email` — callers must pass `sentByUserId`
  (discoverable via `list_lead_assignees`). No delete tool.

This partially lifts ADR-0013’s “write tools out of scope” for **mail only**;
contacts/leads remain read-only on MCP until a separate decision.

## Consequences

- Agents can list/read new inbound mail the IDLE worker ingested, and send
  attributed replies without a browser session.
- Token compromise can send mail as any user UUID the agent invents; rotate the
  MCP token and treat it like a password (same as ADR-0013).
- `MailThreadServiceLike` / `MailSendServiceLike` grow as public host contract
  (ADR-0016); keep changes additive.

## Considered alternatives

- **Read-only mail tools only** — rejected: product ask was full message handling.
- **Bind a fixed agent user on the token row** — deferred; explicit `sentByUserId`
  avoids a migration and keeps attribution visible in the tool call.
- **Delete thread via MCP** — rejected for v1 (destructive, easy to misuse).
