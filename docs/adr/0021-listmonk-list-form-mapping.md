# 0021 — Listmonk list ↔ CRM form mapping in plugin DB

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** team

## Context

Global `LISTMONK_LIST_IDS` sends every subscriber to the same lists. Product needs
per-list assignment of a CRM form (e.g. Bearly landing) so `form.submitted` only
adds the contact to the Listmonk lists linked to that form.

## Decision

We store mappings in a plugin-owned table `lm_list_forms` (`listmonk_list_id` PK →
`form_id`), migrated via Listmonk `onMigrate`. The lists UI assigns a form per
Listmonk list. On `form.submitted`, the plugin resolves mapped list ids for
`payload.formId`; if none, it falls back to configured `LISTMONK_LIST_IDS`.

## Consequences

**Easier:** landing/form-specific newsletters without changing core forms schema.

**Harder:** newsletter operators need `newsletter:manage` to edit mappings; form
catalog for the picker is read via SQL from `forms` (not `forms:manage`) so the
plugin stays self-contained. Do not put this mapping in core `forms` or host config
JSON — keep it plugin-owned like `lm_campaigns`.

## Considered alternatives

- **Only global LISTMONK_LIST_IDS** — insufficient for multiple landings.
- **Form config field pointing at Listmonk list** — couples core forms to Listmonk.
