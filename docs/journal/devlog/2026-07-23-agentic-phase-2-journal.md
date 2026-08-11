# docs/journal/devlog/2026-07-23-agentic-phase-2-journal.md
Issue:    none (agentic base rollout, Phase 2) · branch chore/agentic-base-phase-0
Goal:     stand up the event journal so knowledge stops dying between sessions
Done:     docs/adr/ with template + index + 6 backfill ADRs (0001 record-decisions, 0002 sessions-not-JWT,
          0003 Drizzle, 0004 single-tenant, 0005 Fastify, 0006 plugins-as-TS-source).
          docs/journal/: DEVLOG.md index, devlog/template.md + 3 backfilled entries (phases 0/1/2),
          INCIDENTS.md (2 seed traps), plans/ placeholder. Skills /adr, /incident, /wrap.
Why so:   backfilled 0002–0006 from decisions already frozen in AGENTS.md — the prohibitions existed
          without their "why", which is exactly what makes an agent try to "fix" them. Each ADR names
          the AGENTS.md rule it justifies. INCIDENTS.md seeded only with traps NOT already promoted to
          AGENTS.md (cross-env, forms-ui build order) — no duplication, per the promotion rule.
          /wrap is model-invocable so an agent closing a big task runs it itself.
Failed:   —
Next:     Phase 3 — hooks (format, quality-gate, guard-bash), skills /task /verify, subagents ×3.
Verify:   docs + skills only, no code change — `pnpm verify` unaffected. Markdown/frontmatter reviewed by hand.
