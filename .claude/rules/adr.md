---
description: ADR protocol — Pokelo is source of truth; docs/adr/ is the git mirror. Always in context.
---

# ADR protocol

**Pokelo (Khirby) is the source of truth** for architecture decisions.
`docs/adr/` mirrors them for git/PRs. Leaving Pokelo stale is a miss.

## Create or update

Preferred for agents (non-interactive, syncs Pokelo as `type: ADR`):

1. Write/edit `docs/adr/NNNN-slug.md` + update `docs/adr/README.md`
2. Run:
   ```bash
   node scripts/adr-sync-to-pokelo.mjs docs/adr/NNNN-slug.md
   ```

Interactive human path (opens `$EDITOR`, then publishes):

```bash
bash scripts/adr-publish.sh "Short decision title"
```

After either path the local file must contain
`- **Pokelo ADR id:** \`<uuid>\` (Khirby project)`.

## Never

- Create ADR files and skip Pokelo “for later”
- Create ADRs as Pokelo **Note** / under a docs folder — ADRs are a separate entity
- Call ad-hoc Pokelo creates that bypass `adr-sync-to-pokelo.mjs` unless fixing the script itself
- Treat “it’s in git” as done

## When to write an ADR

Write an ADR when you make a decision that:
- Affects the tech stack, framework, or library choice
- Changes how authentication, auth, or security works
- Defines a new pattern that other code must follow
- Rejects a seemingly obvious alternative (explain why)
- Would surprise a future developer reading the code

When in doubt — write it. A short ADR is better than a missing one.

## Status → Pokelo

| Local status line | Pokelo `status` |
|-------------------|-----------------|
| Starts with `Superseded` | `deprecated` |
| `Accepted` (incl. “amended by…” / “partly superseded by…”) | `approved` |

## Token setup (one time per developer)

`pokelo auth login` **or** in `.env`:

```
POKELO_TOKEN=mcp_...
POKELO_PROJECT_ID=d5fb3b0f-a5e5-44ca-9ec0-d3cc4f50963a
```

Without credentials, sync must fail visibly — do not pretend the ADR is published.
