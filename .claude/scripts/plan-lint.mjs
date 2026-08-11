// plan-lint.mjs — structural pre-pass on a task plan file before the critic runs.
// Validates the skeleton (sections, checkboxes, non-empty AC map) so the
// plan-critic subagent spends its whole context on semantics, not formatting.
//
// Usage: node .claude/scripts/plan-lint.mjs docs/journal/plans/<file>.md
// Exit 0 = structure ok · exit 1 = gaps listed (fix before sending to the critic).
import { readFileSync, existsSync } from 'node:fs';

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.log('usage: plan-lint.mjs <plan-file>  (file must exist)');
  process.exit(2);
}
const text = readFileSync(file, 'utf8');
const gaps = [];

const REQUIRED = ['## Understanding', '## AC map', '## Edge cases', '## Memory hits', '## Steps', '## Findings ledger'];
const sections = {};
for (const name of REQUIRED) {
  const re = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
  const idx = text.search(re);
  if (idx === -1) {
    gaps.push(`missing section: ${name}`);
    continue;
  }
  const rest = text.slice(idx + name.length);
  const next = rest.search(/^## /m);
  sections[name] = (next === -1 ? rest : rest.slice(0, next)).trim();
}

const nonEmpty = (name, min, what) => {
  const bodyText = sections[name];
  if (bodyText === undefined) return;
  const items = (bodyText.match(/^\s*(?:[-*]|\|)\s*\S/gm) ?? []).length;
  if (items < min) gaps.push(`${name}: needs at least ${min} ${what} (found ${items})`);
};

nonEmpty('## AC map', 1, 'criterion→steps mapping line');
nonEmpty('## Edge cases', 1, 'explicit edge case');
nonEmpty('## Memory hits', 1, 'line (devlog/incidents/ADR hits, or an explicit "none — checked")');
if (sections['## Understanding'] !== undefined && sections['## Understanding'].length < 40)
  gaps.push('## Understanding: too thin to prove the spec was understood');
if (sections['## Steps'] !== undefined && !/^\s*[-*]\s*\[[ x]\]/m.test(sections['## Steps']))
  gaps.push('## Steps: no checkbox items (- [ ]) — steps must be tickable, one per iteration');

if (gaps.length) {
  console.log('[plan-lint] PLAN STRUCTURE FAILED — fix before the critic sees it:');
  for (const g of gaps) console.log(`  - ${g}`);
  process.exit(1);
}
console.log('[plan-lint] structure ok — send to plan-critic for the semantic review.');
process.exit(0);
