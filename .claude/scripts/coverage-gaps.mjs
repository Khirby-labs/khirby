// coverage-gaps.mjs — feeds the test-writer facts instead of a hunt.
// Runs api jest with JSON coverage (--run), intersects coverage with the files
// touched by the current diff, and prints the uncovered line ranges per file.
// The test-writer subagent receives this list and writes specs for exactly
// these gaps — it does not explore.
//
// Usage: node .claude/scripts/coverage-gaps.mjs --run [--base main]
//        node .claude/scripts/coverage-gaps.mjs [--base main]   (reuse last coverage run)
// Exit 0 always (informational) · exit 2 on missing coverage data.
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'HEAD';

if (args.includes('--run')) {
  console.log('[coverage-gaps] running api tests with coverage (this takes a while)...');
  spawnSync('pnpm', ['--filter', 'api', 'exec', 'jest', '--coverage', '--coverageReporters=json', '--silent'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
}

const covFile = join(root, 'apps/api/coverage/coverage-final.json');
if (!existsSync(covFile)) {
  console.log('[coverage-gaps] no coverage data — run with --run first.');
  process.exit(2);
}
const coverage = JSON.parse(readFileSync(covFile, 'utf8'));

const git = (c) => {
  try {
    return execSync(c, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
};
const changed = new Set(
  [...git(`git diff --name-only ${base} -- .`), ...git('git ls-files --others --exclude-standard')]
    .filter((f) => /\.(ts|js)$/.test(f) && !/\.spec\./.test(f))
    .map((f) => f.replace(/\\/g, '/')),
);

const toRanges = (lines) => {
  const out = [];
  for (const n of [...lines].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else out.push([n, n]);
  }
  return out.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ');
};

let any = false;
for (const [abs, data] of Object.entries(coverage)) {
  const rel = relative(root, abs).replace(/\\/g, '/');
  if (!changed.has(rel)) continue;
  const uncovered = new Set();
  for (const [id, count] of Object.entries(data.s ?? {})) {
    if (count === 0 && data.statementMap?.[id]) {
      const { start, end } = data.statementMap[id];
      for (let l = start.line; l <= (end.line ?? start.line); l++) uncovered.add(l);
    }
  }
  if (uncovered.size) {
    any = true;
    console.log(`${rel}: uncovered lines ${toRanges(uncovered)}`);
  }
}
if (!any) {
  console.log('[coverage-gaps] all statements in diff-touched api files are covered (or none are in coverage scope).');
}
process.exit(0);
