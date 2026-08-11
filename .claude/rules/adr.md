---
description: ADR protocol — how to create Architecture Decision Records. Always in context.
---

# ADR protocol

When an architectural decision is made, record it with:

```bash
bash scripts/adr-publish.sh "Short decision title"
```

This script:
1. Auto-numbers the ADR (next in sequence from `docs/adr/`)
2. Opens `$EDITOR` with the MADR template pre-filled
3. Saves the file to `docs/adr/NNNN-slug.md`
4. Publishes to Pokelo (reads `POKELO_TOKEN` from `.env` — no manual auth needed)

## Never do this manually

**Do not** create ADR files by hand in `docs/adr/` and **do not** call the Pokelo API directly.
The script keeps local files and Pokelo in sync automatically.

## When to write an ADR

Write an ADR when you make a decision that:
- Affects the tech stack, framework, or library choice
- Changes how authentication, auth, or security works
- Defines a new pattern that other code must follow
- Rejects a seemingly obvious alternative (explain why)
- Would surprise a future developer reading the code

When in doubt — write it. A short ADR is better than a missing one.

## MADR format (what the template gives you)

```markdown
# NNNN — Short decision title

- **Status:** Accepted
- **Date:** YYYY-MM-DD
- **Deciders:** <name>

## Context
What problem are we solving?

## Decision
What did we decide and why?

## Consequences
What becomes easier / harder?

## Considered alternatives
What else was considered and why rejected?
```

## Token setup (one time per developer)

Add to `.env` (already gitignored):

```
POKELO_TOKEN=mcp_...        # generate in Pokelo UI → Settings → API tokens
POKELO_PROJECT_ID=d5fb3b0f-a5e5-44ca-9ec0-d3cc4f50963a
```

Without `POKELO_TOKEN` the script still saves locally — Pokelo publish is skipped with a warning.
