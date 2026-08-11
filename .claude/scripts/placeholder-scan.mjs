// placeholder-scan.mjs — mechanical half of the audit: pattern-detectable
// placeholders in ADDED lines only (pre-existing debt is not this task's
// findings). The auditor agent receives this output and spends its context on
// what grep can't catch: semantic stubs (happy-path without error handling,
// hardcoded values, criteria implemented in name only).
//
// Usage: node .claude/scripts/placeholder-scan.mjs [--base HEAD]
//   --base HEAD  scan working tree vs HEAD (default)
//   --base main  scan the whole branch diff
// Exit 0 = clean · exit 1 = findings listed as file:line.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'HEAD';

const PATTERNS = [
  { re: /\b(TODO|FIXME|XXX|HACK)\b/, label: 'todo-marker' },
  { re: /not[ _-]?implemented/i, label: 'not-implemented' },
  { re: /\b(it|test|describe)\.skip\s*\(/, label: 'skipped-test' },
  { re: /\bx(it|describe|test)\s*\(/, label: 'skipped-test' },
  { re: /\.only\s*\(/, label: 'focused-test (.only left in)' },
  { re: /catch\s*(\([^)]*\))?\s*\{\s*\}/, label: 'empty-catch' },
];
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|vue)$/i;
const EXEMPT = /^(docs\/|\.claude\/)/;

const git = (c) => {
  try {
    return execSync(c, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return '';
  }
};

const findings = [];
const scanLine = (file, lineNo, line) => {
  for (const p of PATTERNS) {
    if (p.re.test(line)) findings.push(`${file}:${lineNo} [${p.label}] ${line.trim().slice(0, 120)}`);
  }
};

// 1) Added lines in tracked diff (unified=0 keeps line math trivial).
const diff = git(`git diff -U0 ${base} -- .`);
let file = null;
let newLine = 0;
for (const line of diff.split('\n')) {
  const f = line.match(/^\+\+\+ b\/(.+)$/);
  if (f) {
    file = !EXEMPT.test(f[1]) && CODE.test(f[1]) ? f[1] : null;
    continue;
  }
  const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
  if (hunk) {
    newLine = Number(hunk[1]);
    continue;
  }
  if (!file) continue;
  if (line.startsWith('+')) {
    scanLine(file, newLine, line.slice(1));
    newLine++;
  }
}

// 2) Untracked code files — scanned whole (everything in them is "added").
for (const f of git('git ls-files --others --exclude-standard').split('\n').filter(Boolean)) {
  if (EXEMPT.test(f) || !CODE.test(f)) continue;
  let content = '';
  try {
    content = readFileSync(new URL(f, `file://${root.replace(/\\/g, '/')}`), 'utf8');
  } catch {
    continue;
  }
  content.split('\n').forEach((l, i) => scanLine(f, i + 1, l));
}

if (findings.length) {
  console.log(`[placeholder-scan] ${findings.length} finding(s) in added lines — resolve or justify each in the ledger:`);
  for (const f of findings) console.log(`  ${f}`);
  process.exit(1);
}
console.log('[placeholder-scan] clean — no pattern-detectable placeholders in added lines.');
process.exit(0);
