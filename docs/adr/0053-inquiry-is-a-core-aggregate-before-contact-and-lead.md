# 0053 — Inquiry is a core aggregate before Contact and Lead

- **Status:** Accepted
- **Date:** 2026-09-19
- **Deciders:** Patryk

## Context

Public form submit always creates a Contact (email upsert) and then a Lead on
the sales pipeline. That path cannot support human review before a person
enters CRM: even with auto-Lead disabled, Contact would still exist. Extending
Lead with pre-lead statuses or a pipeline stage “Do weryfikacji” would force
every Lead consumer (mail, boards, MCP, Kanban) to treat some rows as
non-leads.

## Decision

We add a core **Inquiry** aggregate (`inquiries` + append-only
`inquiry_messages`) that holds incoming requests until a human Accepts,
Rejects, or marks Spam. Contact and Lead are created only on Accept.
Forms gain independent `destination` (`lead` | `inquiry`) and `intakeMode`
(`static` | `adaptive`); existing rows default to `lead` + `static`.
`lead` + `adaptive` is rejected in v1. Adaptive intelligence is an optional
plugin-host token (`INQUIRY_INTAKE_ASSISTANT`), resolved at call time
(ADR-0048) — core must work without AI Compose.

## Consequences

**Easier:** review-first intake without polluting the sales pipeline; static
and adaptive share one aggregate; plugins can subscribe to inquiry lifecycle
events without seeing half-baked Leads.

**Harder:** forms admin and public clients must branch on `destination`;
Accept must be transactional and idempotent; operators need a new RBAC
resource `inquiries:manage` and a “Do weryfikacji” UI. Agents must not add
Inquiry statuses onto Lead or invent a verification pipeline stage.

## Considered alternatives

- **Pre-lead statuses on Lead** — rejected; Lead already requires Contact +
  stage and feeds Kanban/mail/MCP.
- **Pipeline stage “Do weryfikacji”** — rejected; same boundary leak.
- **Disable Lead creation only** — rejected; Contact would still be created
  before review.
