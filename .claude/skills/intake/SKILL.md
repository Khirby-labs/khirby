---
name: intake
description: Turn a raw request or bug report into a Linear issue with the repo's fixed structure — classify bug/feature, recon the code, draft against the template, pass the mechanical gate and a blind critic, then create the issue (parent + sub-issues) in the pinned team. Use whenever a new task needs to exist in Linear.
argument-hint: <what needs doing, or a pasted bug report>
---

# /intake — request in, structured Linear issue out

You are the orchestrator. Same division of labour as `/task`: **scripts establish
facts, agents judge meaning**, and every agent stage gets a script pre-pass. The
output is an issue that `/task` can start from without asking a single question.

There is **no human checkpoint before creation** — the issue is created as soon as
the critic approves. That makes stages 3–5 mandatory, not optional: a bad draft
becomes permanent noise in Linear.

Linear is reached only through `.claude/scripts/linear.mjs` (ADR-0031). Drafts live
in **your scratchpad directory**, never in the repo — Linear is the backlog.

## Stage 0 — Classify

1. Decide the type from the request: **bug** (something behaves wrong now) or
   **feature** (something does not exist yet). Only the type branches; everything
   after this is identical.
2. **A bug without a reproduction stops here.** Ask the user for the steps, the
   error output, or the failing spec — do not reconstruct a plausible repro. This
   is the only stage that talks to the user.
3. Pick a slug: `<type>-<3-4 word kebab summary>`.

## Stage 1 — Recon (parallel, read-only)

Spawn **three Explore agents at once**, each with an explicitly bounded area, and
ask each for: files with `file:line` anchors, the conventions in force there, the
specs that already cover it, and anything in repo memory that changes the approach.

| Agent | Area |
|-------|------|
| 1 | `apps/api/src/**`, `drizzle/migrations/**` — services, controllers, schema, specs |
| 2 | `apps/web/src/**` — views, stores, router, `locales/{pl,en}`, design tokens |
| 3 | `packages/**`, `plugins/**`, `docs/adr/`, `docs/journal/INCIDENTS.md`, `docs/journal/devlog/` (esp. `Failed:` lines) |

Merge their answers yourself. Anything you cannot anchor to a real path does not go
in the code map — the lint will catch it, but the point is not to write it.

## Stage 2 — Draft

1. Copy the template for the type: `.claude/templates/issue-bug.md` or
   `.claude/templates/issue-feature.md` → `<scratchpad>/intake-<slug>.md`.
2. Fill **every** section in Polish and delete every `<!-- … -->` hint. Header line:
   `**Typ:**`, `**Tier:**` (S/M/L — sensitive areas are never S, see
   `.claude/scripts/lib/sensitive.mjs`), `**Obszary:**`.
3. Write the payload `<scratchpad>/intake-<slug>.json`:

```json
{
  "type": "bug",
  "title": "one line, no ticket-speak",
  "descriptionFile": "intake-<slug>.md",
  "labels": ["Bug", "tier:S", "Backend"],
  "priority": 3,
  "subIssues": []
}
```

Labels are resolved by the script and an unknown name is a hard error, so use only
what the team has: type = `Bug` / `Feature`, tier = `tier:S|M|L`, area = `Backend`
for api work, `Frontend` for web work (other areas carry no label today — do not
invent `area:*`). `priority`: 0 none · 1 urgent · 2 high · 3 medium · 4 low.

## Stage 3 — Mechanical gate

```
node .claude/scripts/issue-lint.mjs <scratchpad>/intake-<slug>.md
```

Fix every listed gap and re-run. Three failed attempts on the same gap → stop and
ask the user; do not weaken the draft to satisfy the linter. Passing this also means
`spec-lint.mjs` passes, which is what `/task` runs at its own intake.

## Stage 4 — Blind critic (budget 2)

1. `node .claude/scripts/ledger.mjs budget <scratchpad>/intake-<slug>.md intake`
   — EXHAUSTED → hand the draft to the user with the unresolved dispute.
2. Spawn the **issue-critic** subagent. Give it ONLY: the draft file path and the
   raw request. Never your recon reasoning — the review is blind.
3. `VERDICT: REVISE` → address every numbered gap, back to stage 3.
   `VERDICT: APPROVE` → continue.
4. If the critic asks for decomposition, add `subIssues` (each with its own
   `descriptionFile` drafted from the same template and passed through stage 3).

## Stage 5 — Duplicate check

```
node .claude/scripts/linear.mjs search --query "<the title's meaningful words>"
```

A high-overlap open issue is a decision, not a formality: comment on the existing
issue (`linear.mjs comment`) and stop, or state plainly why this is genuinely
different and continue.

## Stage 6 — Create

```
node .claude/scripts/linear.mjs create --json <scratchpad>/intake-<slug>.json
```

The issue lands in the team's backlog category (never In Progress) — the script
resolves the state, never hardcode a name. Sub-issues are created in one batch with
the parent's id.

Report back to the user: the identifier, the URL, the tier, and the suggested
branch name, then `/task <ID>` as the next step. Do not start implementing — that
is a separate, deliberate decision.

## Rules

- Never invent a path. Every code-map line must survive `issue-lint`.
- Never paste a command output you did not run — especially in `## Dowody`.
- Polish in the issue body, English in the repo (`AGENTS.md` convention).
- The draft is disposable; the issue in Linear is the record.
