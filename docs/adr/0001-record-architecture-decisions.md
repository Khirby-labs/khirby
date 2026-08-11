# 0001 — Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-07-23
- **Deciders:** Damian

## Context

`AGENTS.md` tells contributors — human and agent — *what not to do* (no JWT, no
TypeORM, no multi-tenancy, no Options API). It does not record *why*. An agent
that only sees a prohibition with no rationale is prone to "fixing" the deliberate
choice, because from its point of view the prohibition looks arbitrary. Decisions
made in chat or in a single commit message are not discoverable later; the
reasoning evaporates.

## Decision

We keep a log of architecturally significant decisions in `docs/adr/`, one file
per decision, using a minimal MADR format (Context → Decision → Consequences,
optional Considered alternatives). Files are numbered chronologically starting at
`0001`. New ADRs are proposed via the `/adr` skill and accepted in review. The
first batch (0002–0006) backfills decisions already embedded in `AGENTS.md`.

## Consequences

- Prohibitions in `AGENTS.md` and `.claude/rules/` can point at an ADR for the
  *why*, closing the gap that makes agents override deliberate choices.
- One more ritual: an architectural decision made mid-task means writing an ADR.
  The `/wrap` skill prompts for this so it is not forgotten while context is fresh.
- ADRs are immutable once accepted; a reversal is a new ADR that supersedes the
  old one (never an edit-in-place), preserving the historical reasoning.

## Considered alternatives

- **Decisions live only in `AGENTS.md`** — rejected: it states rules, not
  rationale, and grows unboundedly; ADRs give each decision a stable, citable home.
- **A wiki / Linear docs** — rejected: architecture rationale belongs next to the
  code, versioned with it, readable offline and by any agent tool.
