# 0059 — Accept-from-review lead comment is a handoff, not a field dump

- **Status:** Accepted
- **Date:** 2026-10-10
- **Deciders:** Patryk
- **Pokelo ADR id:** `16219203-893b-4947-b386-4c700836cc52` (Khirby project)

## Context

Accepting an inquiry from review creates a lead and a system comment so the
pipeline has the intake in one place (ADR-0053, ADR-0058). ADR-0058 said that
comment lists `contactFields` as key/value pairs. The implementation also
appended `Type:`, `Company:`, `Problem:`, and `Tags:` with the raw English
keys (`city`, `postalCode`). The same facts already render on the lead under
“Z zapytania”. The comment read as a debug dump next to a usable summary.

## Decision

The automatic comment on accept is a short handoff in the language of the
inquiry text. It opens with the AI summary, or with the problem statement when
there is no summary. After that it lists only facts a person would act on: one
address line (street, postal code, city), phone, any other contact-step values
under the form’s own labels, and brief facts that are not a restatement of the
summary (timeline, desired outcome, current process, tools, team size,
constraints).

It does not list raw field keys, tags, company (already the lead title),
proposed type, or the problem line when a summary exists.

## Consequences

**Easier:** someone reading only the comments sees what the client wants and
where the job is, without a second copy of the origin panel.

**Harder:** agents must not “restore” the key/value dump because ADR-0058
mentioned it. Do not append `Tags:`, `Type:`, `city:`, or `Problem:` lines.
Structured contact data still belongs on the contact (`metadata.formContact`)
and on the lead’s inquiry-origin block.

## Considered alternatives

- **Drop the comment** — rejected. The summary plus the site address is the
  handoff when someone never opens the inquiry.
- **Keep the key/value list** — rejected. It duplicates the origin panel and
  looks like debug to the person who accepted the inquiry.
