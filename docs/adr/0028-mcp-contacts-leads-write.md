# 0028 — MCP contacts and leads create/update (no delete)

- **Status:** Accepted
- **Date:** 2026-08-07
- **Deciders:** Damian Orzeł
- **Pokelo ADR id:** `976b3b1d-f149-4687-8f3e-8a72dd619d5b`

## Context

ADR-0013 shipped contacts/leads as **read-only** MCP tools. ADR-0019 and ADR-0027
already allow attributed mail send and board create/update. Agents still cannot
open a pipeline deal or fix a contact profile without the browser UI, which
blocks common CRM workflows (qualify inbound, correct phone, move stage).

Hard deletes remain irreversible; the same policy as boards (ADR-0027) applies —
MCP annotations are not a security gate when tools are auto-approved.

## Decision

We lift ADR-0013’s write restriction for **contacts and leads create/update** on
the existing MCP plugin, via host bridges `CONTACTS_SERVICE` and `LEADS_SERVICE`
narrowed as `ContactsServiceLike` / `LeadsServiceLike`:

- **Contacts:** `create_contact`, `update_contact` (email, name, phone, metadata).
- **Leads:** `create_lead` → `LeadsService.createManual` (upserts contact by email);
  `update_lead` (title, value, priority, stageId, ownerId — stage change moves the card).
- **No delete tools** for contacts or leads; permanent delete stays in the CRM UI.

Read tools from ADR-0013 remain. `list_contacts` passes a query object to
`ContactsService.findAll` (object API), not positional page args.

## Consequences

- Agents can create and edit CRM people and deals without a session cookie.
- Token compromise can create/overwrite contacts and leads (not hard-delete);
  rotate the MCP token.
- ADR-0019’s note that contacts/leads stay read-only is superseded for
  create/update only.

## Considered alternatives

- **Keep contacts/leads read-only** — rejected: product ask was create + edit.
- **Expose delete with destructiveHint** — rejected: same rationale as ADR-0027.
- **Require actorUserId on contact/lead writes** — deferred: core services do not
  attribute those mutations to a user today (unlike mail/boards).
