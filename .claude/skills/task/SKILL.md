---
name: task
description: Start and drive a Linear issue through the full execution pipeline — intake with spec gate, tiered plan with repo memory, plan critique, implementation loop, audit loop — ending at /verify + /wrap. Use to begin work on any Linear issue.
argument-hint: <issue-id, e.g. BEA-42>
---

# /task — the task execution pipeline (stages 0–4)

You are the orchestrator. Scripts establish facts, agents judge meaning, budgets
are counted by `ledger.mjs` — when a script says stop, you stop and escalate to
the human with the open findings. Never push past an exhausted budget.

## Stage 0 — Intake & spec gate

Linear is reached through `.claude/scripts/linear.mjs` — never through MCP tools
(the project's MCP server is read-only by design; writes go through the script,
which is pinned to one team). Run `node .claude/scripts/linear.mjs` with no
arguments for the command list.

1. Fetch the issue and save its body to a scratch file in one step, then run the
   structural gate:
   `node .claude/scripts/linear.mjs get --issue <ID> --body-file <scratch-file>`
   `node .claude/scripts/spec-lint.mjs <scratch-file>`
   Keep the printed `branchName` — step 5 needs it.
2. If spec-lint fails OR the criteria are present but not measurable: **ask,
   don't guess** — write the concrete questions to a markdown file, post them with
   `linear.mjs comment --issue <ID> --body-file <questions.md>`, tell the user, and
   stop the pipeline here.
3. **Classify the tier** (record it in the plan file header):
   - **S** — one obvious 1–2 file fix, zero design decisions.
   - **M** — one module, a few files, clear ACs.
   - **L** — multiple modules / schema / anything touching auth, RBAC, or
     public endpoints (these are NEVER S — `tier-guard.mjs` enforces this).
4. Set the issue to In Progress:
   `node .claude/scripts/linear.mjs status --issue <ID> --state "In Progress"`.
   States are per-team, so never assume a name: if the state does not exist the
   script exits 1 and prints the team's actual states — pick from that list
   (`linear.mjs meta` shows them any time).
5. Create the branch **from Linear's suggested branch name** (the `branchName`
   from step 1 — keeps auto-linking).

## Stage 1 — Plan from code, task, and memory (M/L; S skips to stage 3)

1. Recon the three sources before proposing step one:
   - **Code** — the modules this task touches, their conventions and tests.
   - **Repo memory** — `grep -ri "<keywords>" docs/journal/devlog/` (especially
     `Failed:` lines — has something similar been tried?), `docs/journal/INCIDENTS.md`
     (known traps on this path), `docs/adr/README.md` (deliberate decisions the
     plan must not "fix").
   - **Auto-memory** — your own notes from previous sessions.
2. Write the plan: copy `docs/journal/plans/template.md` to
   `docs/journal/plans/YYYY-MM-DD-<ISSUE>-<slug>.md` and fill every section.
3. Validate structure: `node .claude/scripts/plan-lint.mjs <plan-file>` — fix
   gaps before the critic ever sees the plan.

## Stage 2 — Plan critique loop (M/L · budget 2)

1. Count the cycle: `node .claude/scripts/ledger.mjs budget <plan-file> critique`
   — if it says EXHAUSTED, hand the plan to the human with the unresolved dispute.
2. Spawn the **plan-critic** subagent (model pinned in its definition). Give it
   ONLY: the plan file path, the issue description with ACs. Not your reasoning —
   the review is blind.
3. `VERDICT: REVISE` → address every numbered gap in the plan, go to 1.
   `VERDICT: APPROVE` → continue.
4. **Human checkpoint (always for M/L):** present the plan + critic verdict and
   wait for explicit approval before writing any code. Mark the plan
   `human-approved`.

## Stage 3 — Implementation loop

Per iteration, strictly:

1. Take the **highest unchecked step** from the plan. One step per iteration.
2. Implement it **together with its tests** — a step without tests is not done.
   (test-writer fills coverage gaps later; it does not write your tests for you.)
3. Run targeted verification (affected specs: `npx jest <path>` from `apps/api`,
   or the relevant suite). Red → fix (up to 3 attempts) → still red:
   `git reset --hard` to the last green commit, flag the step in the plan, ask
   the human. Never "fix forward" on a broken tree.
4. Green → tick the checkbox, commit (conventional message, reference the issue).
5. Every few steps and always before stage 4:
   `node .claude/scripts/tier-guard.mjs --tier <tier>` — if it demands a raise,
   raise the tier in the plan and add the now-required stages.

Rules: no placeholders/stubs (the audit script hunts them; the Stop hook demands
verify evidence). Git is the loop's memory — commit on green, reset on broken.

**Fan-out (L tasks with module-disjoint steps):** steps touching disjoint areas
(an api module / a web view / a package) may run in parallel — spawn one Agent
per step with `isolation: worktree` (`.worktreeinclude` copies `.env` into each
checkout). Hard rules: assign each agent an explicitly bounded area (file
conflicts are solved by worktrees, *logical* conflicts only by disjoint
assignment); each agent runs its own targeted tests before returning; you merge
their work back, run the full targeted verify on the merged tree, and only then
tick the steps. Steps with shared files or an ordering dependency stay
sequential in the main loop.

## Stage 4 — Audit loop (M/L · budget 3)

1. Count the cycle: `node .claude/scripts/ledger.mjs budget <plan-file> audit`
   — EXHAUSTED → escalate to the human with `ledger.mjs open` output.
2. Run the mechanical pre-pass and include its output in the audit brief:
   `node .claude/scripts/placeholder-scan.mjs --base main`
   `node .claude/scripts/tier-guard.mjs --tier <tier>`
3. Spawn the **auditor** subagent. Give it: the base ref for the diff, the plan
   file path, the pre-pass output. Never your conversation history — fresh eyes.
4. Paste its findings into the plan's `## Findings ledger`, then
   `node .claude/scripts/ledger.mjs sync <plan-file>` (exit 3 = oscillation →
   escalate immediately).
5. Fix **only CONFIRMED** findings (`ledger.mjs open <plan-file>` lists them);
   OPEN findings need reproduction first — reproduce or mark REJECTED with the
   reason. After fixes: mark FIXED with evidence, sync, and re-audit **only the
   ledger items**, not the whole diff.
6. `AUDIT CLEAN` → continue.

## Stage 5 — Panel + coverage (L only · budget 2)

1. Run the blind panel via `/review` (it counts the panel budget itself and
   passes the plan file): three forced perspectives — correctness / security /
   architecture — then adversarial verification per finding.
2. Append the returned `ledgerRows` to the plan ledger, `ledger.mjs sync`, fix
   **CONFIRMED only**, re-run the panel (next budget cycle). EXHAUSTED →
   escalate; unresolved findings go into the PR description as known concerns.
3. Coverage: `node .claude/scripts/coverage-gaps.mjs --run` — hand real gaps to
   the **test-writer** subagent (it gets the gap list, never a hunt).

## Finish

1. `/verify` — full gate, paste evidence (writes the marker the Stop hook needs).
2. `/wrap` — devlog, ADR/incident prompts, Linear comment + In Review.
