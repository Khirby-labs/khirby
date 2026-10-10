---
name: adr
description: Record an architecture decision — creates a numbered MADR-minimal ADR in docs/adr/ and syncs it to Pokelo (source of truth). Use when a decision about architecture, a library, a data model, or a cross-cutting convention is made (or surfaces mid-task).
---

# /adr — record an architecture decision

Capture an architecturally significant decision while the reasoning is fresh.
An ADR records the **why** behind a choice, so a future contributor — human or
agent — doesn't undo a deliberate decision that only looks arbitrary.

**Pokelo (Khirby project) is the source of truth** for ADRs. `docs/adr/` is the
git mirror. An ADR that exists only in git is incomplete.

## When this applies

Write an ADR when the decision would make an agent go "why is it done this way?"
and the answer isn't obvious from the code: choosing/rejecting a library, a data
model or auth approach, a cross-cutting convention, a deliberate constraint. Not
for routine implementation choices — those belong in the devlog, if anywhere.

## Steps

1. **Read the index.** Open `docs/adr/README.md` and list `docs/adr/` to find the
   highest existing number `NNNN`. The new ADR is `NNNN+1`, zero-padded to 4 digits.
2. **Confirm the decision** with the user if any part is ambiguous — an ADR states
   a settled choice, not a guess. If it's not actually settled, stop and ask.
3. **Copy the template.** Base the new file on `docs/adr/template.md`. Filename:
   `docs/adr/<NNNN>-<kebab-title>.md`.
4. **Fill it in**, keeping MADR-minimal discipline:
   - **Status:** `Accepted` (or `Proposed` if it still needs sign-off).
   - **Context** — the forces at play, no solution yet.
   - **Decision** — one or two sentences, active voice ("We use X").
   - **Consequences** — what gets easier *and* harder; the costs accepted. If this
     creates a rule agents must not "fix", say so explicitly here.
   - **Considered alternatives** — what was rejected and why (optional but valued).
5. **Update the index table** in `docs/adr/README.md` with the new row.
6. **Sync to Pokelo (mandatory, same turn):**
   ```bash
   node scripts/adr-sync-to-pokelo.mjs docs/adr/<NNNN>-<kebab-title>.md
   ```
   This creates/updates a Pokelo document with **`type: ADR`** (never Note),
   writes `- **Pokelo ADR id:** \`…\` (Khirby project)` into the local file, and
   must succeed before you report done. If auth fails, fix auth — do not ship a
   repo-only ADR.
7. **If this ADR justifies an existing prohibition** in `AGENTS.md` or a
   `.claude/rules/*` file, add a pointer to it there so the rule cites its rationale.
8. **Report** the path, Pokelo ADR id, and one-line summary. Do not commit unless asked.

## Amending or superseding

- Status notes / supersession lines in an existing `docs/adr/*.md` → run the same
  sync script on that file immediately.
- Full reversal → new ADR + set old status to `Superseded by ADR-XXXX` (line must
  **start** with `Superseded`) + sync **both** files.

## Rules

- One decision per file. Chronological numbering, never reused.
- ADRs are **immutable** once accepted. To reverse one, write a new ADR with
  `Status: Accepted` and set the old one's status to `Superseded by ADR-XXXX` —
  never rewrite the original's decision.
- Every "don't" implied by the decision must be paired with a "do instead"
  (pairing rule).
- Never create ADRs as Pokelo Notes or under the documents tree — they are a
  separate entity and must not clutter the docs list.
