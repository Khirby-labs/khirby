# docs/journal/devlog/2026-07-23-agentic-phase-1-context.md
Issue:    none (agentic base rollout, Phase 1) · branch chore/agentic-base-phase-0
Goal:     every session, every teammate, starts from the same lean context
Done:     CLAUDE.md (thin entry-point, @AGENTS.md import); .claude/rules/ ×4 (journal always-on,
          api/web/packages path-scoped); .claude/settings.json (permissions only); .mcp.json (Linear SSE);
          .worktreeinclude (.env into fan-out worktrees). All committed to git.
Why so:   rules EXTEND AGENTS.md, never duplicate it — AGENTS.md stays the cross-tool canon.
          settings.json is permissions-only; hooks deferred to Phase 3 per the phased plan (hooks need
          the verify gate from Phase 0 and the journal from Phase 2 to exist before they can enforce them).
Failed:   —
Next:     Phase 2 — journal layer (docs/adr/ + 6 backfill ADRs, docs/journal/, skills /adr /incident /wrap).
Verify:   config only, no code change — both JSON files parse clean; .claude/ not gitignored.
