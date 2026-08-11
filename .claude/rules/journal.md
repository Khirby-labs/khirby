---
description: Journal protocol — when and how to write the devlog, ADRs, and the incidents registry. Always in context.
---

# Journal protocol

The repo is the team's memory. Three artifacts capture what git alone can't. Each has an
**owner** and a **ritual** so knowledge doesn't go stale.

| Artifact | Lives in | Written when | Via |
|----------|----------|--------------|-----|
| Devlog | `docs/journal/devlog/` (+ `DEVLOG.md` index) | closing a work session | `/wrap` |
| ADR | `docs/adr/` + Pokelo | an architectural decision is made | `bash scripts/adr-publish.sh "title"` |
| Incident | `docs/journal/INCIDENTS.md` | right after a trap bites (esp. your own) | `/incident` |

> All journal artifacts and skills are live: `/adr`, `/incident`, `/wrap`, plus
> `/task` (execution pipeline) and `/verify` (gate with marker) from Phase 3.

## Pairing rule (mandatory)

Every "don't do X" **must** be paired with "do Y instead". Unpaired prohibitions
measurably degrade agent results. This applies everywhere: AGENTS.md, rules, INCIDENTS.md.

## Devlog — one immutable file per work session

Records **why** and **what didn't work** — the things that never reach the git log.
A session with nothing worth remembering produces no entry.

```
# docs/journal/devlog/2026-07-23-pipeline-bulk-actions.md
Issue:    BEA-42 (Linear) · branch damian/bea-42-pipeline-bulk-actions
Goal:     bulk move/delete for pipeline leads
Done:     service + controller + store; 6 new specs green
Why so:   used existing events pipeline instead of new endpoint — see ADR-0007
Failed:   optimistic UI via Pinia $patch — race with SSE updates; reverted
Next:     keyboard multi-select in Kanban (out of scope here)
Verify:   pnpm verify ✅ (74 tests, typecheck clean, lint clean)
```

- `Issue:` is **mandatory** — it gives a topic view for free (`grep BEA-42 docs/journal/devlog/`).
- Files are immutable → no merge conflicts under parallel work.
- `DEVLOG.md` holds **one line per entry** (date · issue · slug · one-sentence hook), newest first.
  The index never grows in prose; open individual entries only when they touch current work.

## ADR — decisions with rationale (MADR minimal)

Context → Decision → Consequences (+ optional considered alternatives). One decision = one
file, chronological numbering. Check `docs/adr/` before changing architecture — AGENTS.md says
what not to do, ADRs say **why**, so the agent doesn't "fix" a deliberate choice.
When a decision surfaces mid-task, `/wrap` prompts: "did a decision worth an ADR emerge?"

## Incidents — so traps don't recur

One file, table format, hard pairing rule:

```
| Date | Trap | Don't | Do instead |
|------|------|-------|------------|
| 2026-07-23 | Jest DI injects [] | add .then to root db mock | makeChain() — no .then at root |
```

- **Ceiling ~25 active entries.** Above that: promote a recurring trap into the AGENTS.md
  pitfalls table or a path-scoped rule (closer to where it bites), then delete the entry.
- Written via `/incident`, immediately after the trap — especially after the agent's own slip.
