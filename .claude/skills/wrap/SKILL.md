---
name: wrap
description: Close a work session — write the devlog entry, prompt for ADR/incident, and report back to Linear (comment + In Review). Invoke at the end of a task, or self-invoke when finishing a substantial piece of work.
disable-model-invocation: false
---

# /wrap — close the session

Turn a finished (or paused) work session into durable memory: a devlog entry, any
decisions/traps worth recording, and a report back to Linear. Run this at the end
of a task. An agent finishing a substantial piece of work should invoke it itself.

## Preconditions

- **Verification first.** A session that touched code is not done until the gate is
  green. Run `/verify` (`node .claude/scripts/verify.mjs` — writes the marker the
  Stop hook checks) and keep the output. If it's red, go back and fix — do not wrap
  a red session and do not claim success without the evidence. (Doc/config-only
  sessions: say so instead.)

## Steps

1. **Gather the facts** of the session: the Linear issue (if any) and branch; what
   shipped; the non-obvious choices; what was tried and abandoned; the verify result.

2. **Write the devlog entry** — one immutable file per session:
   - Path: `docs/journal/devlog/YYYY-MM-DD-<slug>.md` (today's date; short slug).
   - Base it on `docs/journal/devlog/template.md`. Fill every field:
     `Issue:` (mandatory — the Linear id, or `none (<why>)`), `Goal:`, `Done:`,
     `Why so:`, `Failed:`, `Next:`, `Verify:` (paste real evidence, never claim it).
   - `Failed:` is the highest-value field — record what didn't work and why. If the
     session genuinely has nothing worth remembering, skip the entry and say so.
   - Files are immutable — never edit a past entry; a correction is a new entry.

3. **Prepend one line** to `docs/journal/DEVLOG.md` (newest first):
   `YYYY-MM-DD · <issue-or-—> · [<slug>](devlog/<file>.md) — <one-sentence hook>`.
   The index stays one line per entry — no prose.

4. **ADR check (mandatory after commits this session).** For each architectural
   change that landed (or was pushed) without an ADR: run `/adr` now. Also verify
   `docs/adr/README.md` matches files on disk (no orphan index rows / untracked ADRs).
   If nothing architectural changed, say so and move on — do not invent ADRs for
   routine UI polish.

5. **Prompt for incidents.** Ask: *did a trap bite — a wrong assumption, a footgun?*
   If yes, run `/incident`. Especially capture your own slips.

6. **Report to Linear** (skip if the session has no issue):
   Linear is reached through `.claude/scripts/linear.mjs`, never through MCP tools
   (the project's MCP server is read-only; the script is the only write path and is
   pinned to one team).
   - Write the summary to a markdown file — what shipped, the verify evidence, and
     links to any new ADR/incident — then post it:
     `node .claude/scripts/linear.mjs comment --issue <ID> --body-file <report.md>`.
     A file, not an argv string: that is what keeps real newlines out of `\n`.
   - Move the issue to review:
     `node .claude/scripts/linear.mjs status --issue <ID> --state "In Review"`.
     Statuses are per-team and never hardcoded — if that state does not exist the
     script exits 1 and lists the team's real states; pick the nearest review state
     from that list rather than guessing.

7. **Report back** to the user: devlog path, whether an ADR/incident was added, and
   the Linear update. Do **not** commit or push unless the user asks.

## Rules

- Never fabricate the verify result — paste what actually ran.
- Never edit a past devlog entry (immutable → no merge conflicts under parallel work).
- Every "don't" you record (in an ADR or incident) is paired with a "do instead".
