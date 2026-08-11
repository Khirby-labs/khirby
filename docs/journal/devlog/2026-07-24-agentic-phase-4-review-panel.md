# docs/journal/devlog/2026-07-24-agentic-phase-4-review-panel.md
Issue:    none (agentic base rollout, Phase 4 — final) · branch chore/agentic-base-phase-0
Goal:     blind review panel workflow + /review skill + worktree fan-out rules — pipeline stage 5 live
Done:     .claude/workflows/review-panel.js (3 blind perspectives correctness/security/architecture,
          sonnet ×3 with security→opus at tier L; dedup barrier; adversarial verifier per finding,
          refute-by-default; returns confirmed/rejected/ledgerRows). Skill /review (standalone + stage-5
          mode with panel budget via ledger.mjs). /task: stage 5 rewritten to live panel, stage 3 got
          concrete worktree fan-out rules (disjoint areas, own targeted tests, merge + verify by main loop).
Why so:   validated the workflow by running it FOR REAL on the branch diff (main...HEAD, 4 phases of work)
          — the panel's first run reviewed the base that built it. 6 agents, ~284k tokens, 6.2 min.
Failed:   nothing reverted — but the panel CONFIRMED 3 real defects in our own enforcement layer:
          P1 (high) force-push guard regex + settings deny glob also blocked --force-with-lease, the exact
          alternative the deny reason recommends; P2 (med) `rm -r -f` (split flags) bypassed the rm guard;
          P3 (low) .playwright-mcp/ artifacts + 01-login.png were committed in 2fcdd20 before the ignore.
          All three fixed (lookahead regexes, 4 explicit deny globs, git rm --cached ×11). Then a 4th bug
          found itself: the live guard denied the phase-4 COMMIT because its message *mentioned* `rm -r -f`
          — regex scanned prose, not command positions. Fixed by anchoring all rules to command position
          (start/newline/;&|/$( ); final matrix 24/24 incl. prose-in-arguments cases. Both meta-traps
          logged in INCIDENTS. Note: P3 files remain in local branch history (benign, branch unpushed).
Next:     agentic base COMPLETE (phases 0–4). Ahead: first real /task run end-to-end, budget tuning after
          a few tasks, CI gates as the separately deferred stage.
Verify:   pnpm verify ✅ via verify.mjs (typecheck clean, lint clean incl. workflow globals block,
          api 102 + web 17 + forms-client 9 + forms-ui 3; marker written) · guard matrix 14/14 correct
