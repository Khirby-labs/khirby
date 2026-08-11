// quality-gate.mjs — Stop hook: a turn that edited code files cannot finish
// without fresh verify evidence. "Done" is mechanical, not declared.
//
// Logic:
//   1. stop_hook_active → allow (single nudge per stop; prevents infinite loops).
//   2. Collect code files THIS session edited (parsed from the transcript —
//      a user's dirty tree never blocks a conversational turn).
//   3. No code edits → allow (doc/config-only turns are exempt).
//   4. Marker .claude/.verify-ok.json (written only by scripts/verify.mjs on a
//      green run) must be newer than the last edit — else block with the fix.
// Fail-open on parse errors: a broken gate must not brick the session.
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}
if (input.stop_hook_active) process.exit(0);

const cwd = input.cwd || process.cwd();
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|vue)$/i;
const EXEMPT = /[/\\](docs|\.claude)[/\\]/;

const edited = new Set();
try {
  const transcript = readFileSync(input.transcript_path, 'utf8');
  for (const line of transcript.split('\n')) {
    if (!line.includes('"tool_use"')) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type !== 'tool_use') continue;
      if (!['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(block.name)) continue;
      const fp = block.input?.file_path ?? block.input?.notebook_path;
      if (fp && CODE.test(fp) && !EXEMPT.test(fp) && fp.startsWith(cwd)) edited.add(fp);
    }
  }
} catch {
  process.exit(0); // fail-open: never brick the session on a gate bug
}
if (!edited.size) process.exit(0);

let ok = false;
const markerPath = join(cwd, '.claude', '.verify-ok.json');
if (existsSync(markerPath)) {
  try {
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
    let newest = 0;
    for (const f of edited) {
      try {
        newest = Math.max(newest, statSync(f).mtimeMs);
      } catch {
        /* deleted since edit — ignore */
      }
    }
    ok = marker.ts >= newest;
  } catch {
    ok = false;
  }
}
if (ok) process.exit(0);

const list = [...edited].slice(0, 5).join(', ') + (edited.size > 5 ? ` (+${edited.size - 5} more)` : '');
console.log(
  JSON.stringify({
    decision: 'block',
    reason:
      `Code was edited this session (${list}) but there is no verify evidence fresher than the last edit. ` +
      'Run `node .claude/scripts/verify.mjs` (skill /verify) and paste the result. ' +
      'Green -> finish the turn; red -> keep fixing, never report success. Doc-only turns pass automatically.',
  }),
);
process.exit(0);
