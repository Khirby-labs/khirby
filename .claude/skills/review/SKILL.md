---
name: review
description: Run the blind review panel (correctness / security / architecture, adversarially verified) on a diff — standalone on any branch, or as stage 5 of the /task pipeline. Use when asked to review changes, or before opening a PR on substantial work.
argument-hint: "[base-ref, default main]"
---

# /review — blind panel with adversarial verification

Three reviewers with forced perspectives judge the diff blind (none sees the
others — the antidote to groupthink). Every finding then faces an independent
verifier whose default stance is to refute it. Only CONFIRMED findings count;
opinions die in verification.

## Steps

1. **Scope the diff.** Base ref = the argument, or `main` by default. Confirm
   there is actually a diff (`git diff <base> --stat`); an empty diff = nothing
   to review, say so and stop.
2. **Inside /task?** If this run is stage 5 of a task pipeline:
   - count the cycle first: `node .claude/scripts/ledger.mjs budget <plan-file> panel`
     — EXHAUSTED → escalate to the human, do not run the panel;
   - pass the plan file so reviewers see the acceptance criteria.
3. **Run the workflow** (multi-agent fan-out):
   `Workflow` with `name: "review-panel"` and args:
   `{ "base": "<ref>", "tier": "<S|M|L>", "planFile": "<plan path or null>" }`.
   Tier L pins the security reviewer to opus (auth/RBAC/public surface changes
   deserve the strongest eyes).
4. **Consume the result:**
   - **In /task:** append `ledgerRows` to the plan's `## Findings ledger`, run
     `node .claude/scripts/ledger.mjs sync <plan-file>`, fix CONFIRMED findings
     (implementation loop rules apply), then re-run the panel — next budget cycle.
   - **Standalone:** report confirmed findings as a table (id, severity,
     file:line, desc, evidence) and list the refuted ones with one-line reasons —
     refutations are signal too (they document what was checked).
5. **Never** treat a rejected finding as a to-do, and never fix anything the
   verifier did not confirm — that is exactly the false-positive churn the
   verification stage exists to kill.

## Notes

- The panel reviews *changes*, not the whole codebase — a repo-wide audit is a
  different (bigger) exercise; scope it explicitly with the user first.
- Reviewers are told ADR-documented decisions are not findings; if one slips
  through, REJECT it in the ledger citing the ADR.
