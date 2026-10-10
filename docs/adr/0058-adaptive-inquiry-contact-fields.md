# 0058 — Adaptive inquiry contact fields (operator-defined)

- **Status:** Accepted — intake comment shape amended by [ADR-0059](0059-accept-lead-comment-is-a-handoff.md)
- **Date:** 2026-10-10
- **Deciders:** Patryk
- **Pokelo ADR id:** `045b7765-7fba-428d-87b3-b177318aaa36` (Khirby project)

## Context

Adaptive inquiry intake (ADR-0054) collects AI follow-ups via ephemeral
`/adaptive/plan` then one-shot `POST …/inquiries` with
`{ opening, questions, answers, name?, email?, company? }`. Landings that need
extra contact data (phone, street, postal code, city) were stuffing those into
`questions[]`/`answers[]`, which hits `ADAPTIVE_MAX_FOLLOW_UPS` (5) and buries
values in the transcript. ADR-0054 left “schema-field generation from the brief”
out of scope for the LLM — operators still need a fixed contact-step schema.

## Decision

For `destination=inquiry` + `intakeMode=adaptive`, we reuse `forms.schema` as the
**contact-step field list** (operator-authored in the builder beside
AdaptiveIntakePanel — not generated from the brief).

- Reserved first-class keys stay top-level on submit: `name`, `email`, `company`.
  Those names must not appear in `forms.schema`.
- Public `GET /api/public/forms/:token` resolves schema labels for `?locale=` and
  returns them as both `fields` and `contactFields` (same array) so landings can
  bind the contact step without confusing it with AI follow-ups.
- Public adaptive submit accepts optional `fields: Record<string, unknown>`
  keyed by `field.name`. Validation uses the same schema rules as static
  submissions; `assertPublicAdaptiveBatch` and `ADAPTIVE_MAX_FOLLOW_UPS` apply
  only to LLM Q&A.
- Persisted values live in `sourceMeta.contactFields` (alongside HTTP source
  keys). First-class contact columns stay on the inquiry row.
- On accept: `tel` / `phone` → `contacts.phone` (thread regex remains a
  fallback); the full `contactFields` bag → `contacts.metadata.formContact`
  (not `metadata.custom` — no `custom_field_definitions` required). Lead detail
  exposes the same bag as `inquiryOrigin.contactFields`, and the system intake
  comment lists the key/value pairs.
- `@khirby/forms-client` exposes `contactFields` on `PublicForm` and `fields` on
  `SubmitAdaptiveInquiryInput`.

## Consequences

**Easier:** landings send address/phone without burning follow-up slots; review
UI can show structured contact extras without scraping Q&A.

**Harder:** adaptive save must persist `schema` (builder previously cleared it).
Agents must not raise `ADAPTIVE_MAX_FOLLOW_UPS` to “fix” missing contact
fields, and must not ask the LLM to invent schema fields from the brief.

## Considered alternatives

- **New `contact_fields` jsonb column** — rejected for v1; `forms.schema` already
  has bilingual labels and validation; adaptive simply reinterprets it as the
  contact step.
- **Raise `ADAPTIVE_MAX_FOLLOW_UPS`** — rejected; conflates AI questions with
  fixed contact inputs and keeps values in the transcript.
- **LLM schema generation from the brief** — remains out of scope (ADR-0054).
