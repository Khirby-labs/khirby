# Plan — <ISSUE-ID> <title>

Issue:  <ISSUE-ID> (Linear) · branch <branch> · tier S/M/L
Status: draft | critic-approved | human-approved | in-progress | done

## Understanding

What this task is and why, in your own words — the proof the spec was understood.

## AC map

Every acceptance criterion → the steps that realize it. A criterion with no step
is a plan bug (the critic will find it).

- AC-1 "<criterion>" → steps 1, 3
- AC-2 "<criterion>" → step 2

## Edge cases

Explicit list — empty states, network/session failure, concurrency, RBAC denials,
public-endpoint abuse. The critic hunts for what is missing here.

- <edge case> → handled in step N, tested by <spec>

## Memory hits

What the repo already knows about this area — check before step 1:
devlog (`grep -ri <keyword> docs/journal/devlog/`), INCIDENTS.md, docs/adr/README.md.
Write "none — checked <keywords>" if genuinely empty.

- <devlog/incident/ADR reference> → <what it changes about the approach>

## Steps

One step = one iteration = code + its tests, completable and verifiable alone.
Tick only after targeted verify is green and the step is committed.

- [ ] 1. <step>
- [ ] 2. <step>

## Findings ledger

Filled during audit/panel (stages 4–5). States: OPEN → CONFIRMED → FIXED →
VERIFIED, or REJECTED (+reason). Only CONFIRMED findings may be fixed; VERIFIED
is granted by the verifier, never the fix author. Managed by `ledger.mjs`.

| id | source | severity | desc | status | evidence |
|----|--------|----------|------|--------|----------|
