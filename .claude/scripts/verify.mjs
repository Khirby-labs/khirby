// verify.mjs — the one blessed way to run the quality gate.
// Runs `pnpm verify` from the repo root; on green writes .claude/.verify-ok.json
// (timestamp + HEAD) which the Stop hook (quality-gate.mjs) checks before
// letting a code-editing turn finish. Red run = no marker.
// Usage: node .claude/scripts/verify.mjs
import { spawnSync, execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const t0 = Date.now();

const r = spawnSync('pnpm', ['verify'], { cwd: root, stdio: 'inherit', shell: true });

if (r.status === 0) {
  let head = '';
  try {
    head = execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    /* marker still valid without head */
  }
  const marker = { ts: Date.now(), head, durationMs: Date.now() - t0 };
  writeFileSync(new URL('../.verify-ok.json', import.meta.url), JSON.stringify(marker) + '\n');
  console.log('\n[verify] GREEN — marker written (.claude/.verify-ok.json). Safe to finish the turn.');
} else {
  console.log('\n[verify] RED — no marker written. Fix the failures and re-run; do not report success.');
}
process.exit(r.status ?? 1);
