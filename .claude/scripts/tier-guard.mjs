// tier-guard.mjs — deterministic tier enforcement on the actual diff.
// The S/M/L tier is declared at intake by judgment; this script checks the
// declaration against facts as the diff grows: sensitive areas (auth, RBAC,
// schema, public endpoints, deploy) force L; an S task sprawling past a couple
// of code files forces M. Runs during implementation and before audit.
//
// Usage: node .claude/scripts/tier-guard.mjs --tier S|M|L [--base main]
// Exit 0 = tier holds · exit 1 = tier must be raised (message says to what).
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// The list lives in lib/sensitive.mjs so /intake proposes a tier from the very
// same paths this script enforces. Never re-declare it here.
import { CODE, EXEMPT, sensitiveHits as sensitiveHitsIn } from './lib/sensitive.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const tier = (args[args.indexOf('--tier') + 1] ?? '').toUpperCase();
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'main';
if (!['S', 'M', 'L'].includes(tier)) {
  console.log('usage: tier-guard.mjs --tier S|M|L [--base <ref>]');
  process.exit(2);
}

const git = (c) => {
  try {
    return execSync(c, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
};
const changed = new Set([
  ...git(`git diff --name-only ${base}...HEAD`),
  ...git('git diff --name-only HEAD'),
  ...git('git ls-files --others --exclude-standard'),
]);

const files = [...changed].filter((f) => !EXEMPT.test(f));
const sensitiveHits = sensitiveHitsIn(files);
const codeFiles = files.filter((f) => CODE.test(f));

if (sensitiveHits.length && tier !== 'L') {
  console.log(`[tier-guard] RAISE TO L — diff touches sensitive areas at tier ${tier}:`);
  for (const f of sensitiveHits) console.log(`  - ${f}`);
  console.log(
    'Raise the tier in the plan file, then continue with the L stages (audit + panel; security reviewer mandatory).',
  );
  process.exit(1);
}
if (tier === 'S' && codeFiles.length > 2) {
  console.log(
    `[tier-guard] RAISE TO M — tier S allows an obvious 1-2 file fix; diff has ${codeFiles.length} code files:`,
  );
  for (const f of codeFiles) console.log(`  - ${f}`);
  console.log(
    'Raise to M: write a plan file, run the critic, and get plan approval before continuing.',
  );
  process.exit(1);
}
console.log(`[tier-guard] tier ${tier} holds (${codeFiles.length} code files, 0 sensitive hits).`);
process.exit(0);
