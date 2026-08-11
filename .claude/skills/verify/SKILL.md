---
name: verify
description: Run the full quality gate (typecheck + lint + all tests) with evidence, writing the green marker the Stop hook checks. Use before finishing any code-editing turn, after each fix loop, and whenever asked to prove the tree is green.
---

# /verify — the mechanical definition of done

One command decides whether work can be called done. Never claim green — paste it.

## Steps

1. **Run the blessed wrapper** from the repo root:

   ```
   node .claude/scripts/verify.mjs
   ```

   It runs `pnpm verify` (typecheck + lint + api/web/forms-client/forms-ui tests)
   and — only on a green run — writes `.claude/.verify-ok.json`, the marker the
   Stop hook (`quality-gate.mjs`) requires before a code-editing turn may finish.
   Running bare `pnpm verify` proves nothing to the gate — always use the wrapper.

2. **Paste the evidence**: the final per-suite results and the wrapper's
   GREEN/RED line. Summarize as: `pnpm verify ✅ (N tests, typecheck clean, lint clean)`
   — with the real numbers from the output, never invented ones.

3. **On red**: go back to work. Fix the failure, re-run. Do not report progress
   as success, do not rationalize a red gate as "unrelated". If the failure is
   genuinely pre-existing on a clean tree, prove it: stash your changes, re-run,
   show both outputs — then tell the user and stop.

## Rules

- The marker is only valid if fresher than the last code edit — editing after a
  green run means running again.
- Never edit tests to make them pass without understanding why they failed.
- Never `it.skip` / `--testPathIgnorePatterns` your way to green (placeholder-scan
  will catch it anyway) — fix or report instead.
