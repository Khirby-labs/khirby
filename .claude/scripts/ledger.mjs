// ledger.mjs — deterministic mechanics of the findings loop.
// The findings ledger lives as a markdown table under "## Findings ledger" in the
// task's plan file. This script — not the agent's self-discipline — enforces:
//   - legal states and required evidence,
//   - loop budgets (intake 2 · critique 2 · audit 3 · panel 2),
//   - oscillation detection (a previously VERIFIED finding losing that state).
// State snapshots live in .claude/.ledger-state.json (gitignored).
//
// Usage:
//   node .claude/scripts/ledger.mjs sync   <plan-file>          validate + snapshot; exit 3 on oscillation
//   node .claude/scripts/ledger.mjs open   <plan-file>          list findings the implementer may fix (CONFIRMED)
//   node .claude/scripts/ledger.mjs budget <file> <loop>        count one cycle of intake|critique|audit|panel; exit 1 when exhausted
//
// `budget` keys off the file path only, so /intake counts its critic cycles
// against the draft file it is holding — it has no plan file yet.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const STATES = ['OPEN', 'CONFIRMED', 'FIXED', 'VERIFIED', 'REJECTED'];
const BUDGETS = { intake: 2, critique: 2, audit: 3, panel: 2 };
const stateFile = fileURLToPath(new URL('../.ledger-state.json', import.meta.url));

const [, , cmd, planArg, loop] = process.argv;
if (!cmd || !planArg || (cmd === 'budget' && !(loop in BUDGETS))) {
  console.log(
    'usage: ledger.mjs sync|open <plan-file> | ledger.mjs budget <file> intake|critique|audit|panel',
  );
  process.exit(2);
}
const planPath = resolve(planArg);

function loadState() {
  if (!existsSync(stateFile)) return {};
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    return {};
  }
}
function saveState(all) {
  writeFileSync(stateFile, JSON.stringify(all, null, 2) + '\n');
}

function parseLedger() {
  if (!existsSync(planPath)) {
    console.error(`[ledger] plan file not found: ${planPath}`);
    process.exit(2);
  }
  const text = readFileSync(planPath, 'utf8');
  const section = text.split(/^## Findings ledger\s*$/m)[1];
  if (section === undefined) {
    console.error(
      '[ledger] no "## Findings ledger" section in the plan file — add it (see plans/template.md).',
    );
    process.exit(2);
  }
  const rows = [];
  for (const line of section.split('\n')) {
    const m = line.match(/^\s*\|(.+)\|\s*$/);
    if (!m) continue;
    const cells = m[1].split('|').map((c) => c.trim());
    if (cells.length < 6) continue;
    const [id, source, severity, desc, status, evidence] = cells;
    if (/^-+$/.test(id) || /^id$/i.test(id)) continue; // header / separator
    rows.push({ id, source, severity, desc, status: status.toUpperCase(), evidence });
  }
  return rows;
}

function validate(rows) {
  const errors = [];
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.id)) errors.push(`duplicate id ${r.id}`);
    seen.add(r.id);
    if (!STATES.includes(r.status))
      errors.push(`${r.id}: illegal state "${r.status}" (allowed: ${STATES.join(' ')})`);
    if (['FIXED', 'VERIFIED', 'REJECTED'].includes(r.status) && !r.evidence)
      errors.push(`${r.id}: state ${r.status} requires non-empty evidence/reason`);
  }
  return errors;
}

const all = loadState();
const key = planPath.replace(/\\/g, '/');
const entry = all[key] ?? {
  findings: {},
  budgets: { intake: 0, critique: 0, audit: 0, panel: 0 },
};

if (cmd === 'budget') {
  entry.budgets[loop] = (entry.budgets[loop] ?? 0) + 1;
  all[key] = entry;
  saveState(all);
  const used = entry.budgets[loop];
  const max = BUDGETS[loop];
  if (used > max) {
    console.log(
      `[ledger] ${loop} budget EXHAUSTED (${used - 1}/${max} cycles used). STOP — escalate to the human with the open findings; do not run another cycle.`,
    );
    process.exit(1);
  }
  console.log(`[ledger] ${loop} cycle ${used}/${max} — proceed.`);
  process.exit(0);
}

const rows = parseLedger();
const errors = validate(rows);

if (cmd === 'open') {
  const open = rows.filter((r) => r.status === 'CONFIRMED');
  if (!open.length)
    console.log('[ledger] no CONFIRMED findings — nothing may loop back to the implementer.');
  for (const r of open) console.log(`${r.id} [${r.severity}] ${r.desc} (source: ${r.source})`);
  process.exit(0);
}

// cmd === 'sync'
let oscillation = false;
for (const [id, prev] of Object.entries(entry.findings)) {
  const now = rows.find((r) => r.id === id);
  if (prev === 'VERIFIED' && (!now || now.status !== 'VERIFIED')) {
    console.error(
      `[ledger] OSCILLATION: ${id} was VERIFIED and is now ${now ? now.status : 'missing'}. A fix reverted verified work.`,
    );
    oscillation = true;
  }
}
for (const e of errors) console.error(`[ledger] ${e}`);

entry.findings = Object.fromEntries(rows.map((r) => [r.id, r.status]));
all[key] = entry;
saveState(all);

const counts = {};
for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
console.log(
  `[ledger] ${rows.length} findings: ${STATES.map((s) => `${s}=${counts[s] ?? 0}`).join(' ')}`,
);
if (oscillation) {
  console.error('[ledger] STOP — escalate to the human immediately (oscillation).');
  process.exit(3);
}
if (errors.length) process.exit(1);
process.exit(0);
