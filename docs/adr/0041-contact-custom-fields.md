# 0041 — Contact custom fields and JSON CSV import

- **Status:** Accepted
- **Date:** 2026-09-06
- **Deciders:** Khirby

## Context

Public docs already describe operator-defined extra columns on contacts and a CSV import. Contacts only persist email, name, and phone; leftover data sits in `metadata` next to `interests` and `listmonk`. A naive read-modify-write of that JSON would drop parallel edits and plugin keys. Public form fields already have bilingual labels (ADR-0025); operator-facing custom field names do not need that. Fastify has no multipart plugin (ADR-0005), and `apiClient` always sends `application/json`.

## Decision

We store definitions in `custom_field_definitions` (entity, one operator name, slug, type, select options). Values live on `contacts.metadata.custom` keyed by slug. Writes merge with PostgreSQL `jsonb_set` per key so `interests` / `listmonk` and concurrent PATCHes of different slugs survive. CSV import is JSON `{ mapping, rows }` through the existing client — not multipart. Fastify `bodyLimit` is 5 MB so a 1000-row payload fits. Custom-field names are a single operator string; ADR-0025 stays the public-form rule.

## Consequences

- Agents (MCP + Ask Khirby) write `custom` through the same jsonb_set update and JSON `importRows` surface; they list definitions via `listCustomFields` on `ContactsServiceLike`.
- Sorting contacts by a custom field as a real column needs a later ADR (and likely a values table).
- The 5 MB limit applies to every JSON body, not only import.
- Deleting a definition leaves orphan keys in `metadata.custom`; the card and filters ignore keys without a definition, and they must not appear under “Other details”.
- Agents must not “fix” operator names into `en`/`pl` pairs, and must not introduce `@fastify/multipart` for this flow.

## Considered alternatives

- **Values table** — cleaner for sort/index; more migration and join cost for v1.
- **Multipart upload** — would require a new Fastify plugin and a `Content-Type` exception in `apiClient`.
- **Bilingual names** — copies ADR-0025 onto an internal operator surface that has one reader.
