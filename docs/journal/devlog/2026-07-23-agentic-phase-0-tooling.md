# docs/journal/devlog/2026-07-23-agentic-phase-0-tooling.md
Issue:    none (agentic base rollout, Phase 0) · branch chore/agentic-base-phase-0
Goal:     make "done" mechanical — ESLint, typecheck, Prettier, one `pnpm verify` gate
Done:     root ESLint 9 flat config; typecheck scripts (api tsc, web vue-tsc, packages tsc);
          Prettier + .editorconfig; `pnpm verify` = typecheck+lint+test+test:web+test:forms-client+test:forms-ui.
          Green: typecheck all, lint clean, api 102 / web 17 / forms-client 9 / forms-ui 3.
          Docs: docs/DESIGN.md → docs/ARCHITECTURE.md, root design.md retired, docs/DESIGN-SYSTEM.md stub.
Why so:   root `eslint .` over `pnpm -r lint` — 7 workspaces have no lint script; one config covers the monorepo.
          no-explicit-any OFF on purpose — Drizzle 0.40 `.values()/.set()` need `as any` (see ADR-0006/AGENTS.md).
Failed:   nothing reverted, but two pre-existing bugs surfaced and were fixed, not worked around:
          (1) web client.spec expected 401→'Unauthorized' but client throws 'Session expired' — stale test.
          (2) forms-client/forms-ui used Unix inline `NODE_OPTIONS=` — broke on Windows; fixed with cross-env.
Next:     Phase 1 — context layer (CLAUDE.md, rules, settings, .mcp.json).
Verify:   pnpm verify ✅ (131 tests across 4 suites, typecheck clean, lint clean)
