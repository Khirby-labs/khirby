---
name: incident
description: Log a trap that just bit — appends a paired don't/do row to docs/journal/INCIDENTS.md. Use immediately after hitting a non-obvious gotcha, wrong assumption, or footgun, especially your own.
---

# /incident — log a trap so it doesn't recur

Record a trap the moment it bites — a non-obvious gotcha, a wrong assumption, a
footgun in the tooling or codebase. Especially your own slips: the whole point is
that the next agent (or you, next week) doesn't lose the same hour.

## Steps

1. **Open** `docs/journal/INCIDENTS.md`.
2. **Check for a duplicate.** If the trap is already listed, or already lives in
   the `AGENTS.md` pitfalls table / a `.claude/rules/*` file, do **not** add a row —
   tell the user where it already is. Promoted traps live there, not here.
3. **Append one row** to the table:

   | Date | Trap | Don't | Do instead |
   |------|------|-------|------------|
   | YYYY-MM-DD | what went wrong, concretely | the tempting-but-wrong move | the correct move |

4. **Honor the pairing rule:** the "Don't" and "Do instead" cells are both
   mandatory. An unpaired prohibition measurably degrades results — never leave
   "Do instead" empty.
5. **Keep it concrete and short.** Name the symptom someone would recognize, not a
   vague category. One trap per row.
6. **Report** the row added. Do not commit unless asked.

## Ceiling & promotion

Keep the registry at **~25 active entries**. If it's over, or a trap keeps
recurring, promote it: move it into the `AGENTS.md` pitfalls table, or a
path-scoped `.claude/rules/*` file if it's local to one area (closer to where it
bites) — then delete the row here. Mention the promotion when you make it.
