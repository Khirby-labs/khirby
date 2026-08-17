# CLAUDE.md — Khirby (agentic entry point)
@AGENTS.md

## Orientation (read before non-trivial work)
- Recent context: docs/journal/DEVLOG.md (index — open entries only as needed)
- Architectural decisions: docs/adr/ — check before changing architecture;
  propose a new ADR (skill /adr) when you make one
- Known traps: docs/journal/INCIDENTS.md
- UI design system for apps/web: docs/DESIGN-SYSTEM.md.
  System architecture & request flow: docs/ARCHITECTURE.md.

## Task flow
- Tasks live in Linear. Write new ones with /intake (it drafts against the fixed
  bug/feature template, checks every code-map path against disk, and creates the
  issue). Start work with /task <issue-id>; finish with /wrap.
- Linear access goes through `.claude/scripts/linear.mjs` (key in `.env` as
  `LINEAR_API_KEY`, team pinned in `.claude/linear.json`). The MCP server in
  `.mcp.json` is the read-only endpoint — it cannot and must not write.
- Branch names come from Linear's suggestion (keeps auto-linking).
- Definition of done is mechanical: /verify must pass (typecheck+lint+tests).
  Paste the evidence, never claim it.

## Verification
- `pnpm verify` = typecheck + lint + all tests. Run from repo root.
- Never mark work complete with a red gate. No placeholder implementations.
