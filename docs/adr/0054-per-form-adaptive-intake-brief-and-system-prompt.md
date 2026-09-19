# 0054 — Per-form adaptive intake brief and system prompt

- **Status:** Accepted
- **Date:** 2026-09-19
- **Deciders:** Patryk

## Context

ADR-0053 introduced adaptive inquiry intake via `INQUIRY_INTAKE_ASSISTANT`, but
the Compose plugin used a single hardcoded system prompt. Operators had no way
to describe what a given form should gather, and the forms builder still showed
the classic schema editor for adaptive modes — which does not match a
conversational intake.

## Decision

Adaptive inquiry forms (`destination=inquiry`, `intakeMode=adaptive`) store:

- `intake_brief` — operator intent (a few sentences)
- `system_prompt` — the prompt the assistant uses at runtime
- `opening_labels` — first visitor-facing question as `{ en, pl }` (co-drafted
  with the system prompt; not a numbered placeholder)

The builder flow is: brief → AI-drafted system prompt + opening questions
(editable) → stepped form preview → site integration snippets. Drafting uses
`InquiryIntakeAssistant.draftSystemPrompt` (returns `systemPrompt` and
`openingLabels`). Preview uses an admin
`preview-chat` / `plan-questions` endpoint that calls the assistant **without**
writing Inquiry rows. Runtime public plan/submit and admin preview pass the
form's `systemPrompt` into the assistant (plugin default only when the column
is empty).
Public `GET /api/public/forms/:token` resolves `openingLabel` for `?locale=`.

**Public adaptive intake (ephemeral plan + one-shot persist):**
1. `POST /api/public/forms/:token/adaptive/plan` with `{ opening }` — one
   `planQuestions` LLM call, returns `questions[]` (default 3). **No Inquiry row.**
2. `POST /api/public/forms/:token/inquiries` with
   `{ opening, questions, answers, name?, email?, company? }` — single transaction
   creates the inquiry, full Q→A transcript, AI finalize, and
   `ready_for_review`. No intermediate `/messages` or partial rows.

Turn-by-turn / multi-step public message APIs are removed for adaptive forms.

**Language (ADR-0025):** the stored system prompt is language-neutral. Visitor
language (`pl` | `en`) is a runtime `locale` on plan/submit calls — never
copied from the CRM operator UI locale into the prompt. Opening labels are
authored in both locales up front.

## Consequences

**Easier:** each adaptive form has its own behaviour; operators can test before
going live without polluting the review queue.

**Harder:** adaptive save requires a non-empty system prompt; AI Compose must be
configured to draft or preview. Agents must not put the prompt only in plugin
settings or invent a second preview path that creates real inquiries.

## Considered alternatives

- **Global Compose system prompt only** — rejected; forms differ by intent.
- **Preview via public createInquiry** — rejected; pollutes Inquiries.
- **Schema-field generation from the brief** — out of scope for adaptive v1.
