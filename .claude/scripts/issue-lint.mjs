// issue-lint.mjs — structural gate on an /intake draft BEFORE it becomes a Linear
// issue. Same division of labour as the rest of the script layer: this file
// establishes facts (are the sections there? do the paths exist?), the issue-critic
// agent judges meaning (are the criteria the right ones?).
//
// The strongest check here is path existence. An agent writing a code map from a
// half-remembered repo invents plausible file names, and a reviewer reading prose
// cannot tell an invented path from a real one — `existsSync` can, every time.
//
// Usage: node .claude/scripts/issue-lint.mjs <draft.md>
// Exit 0 = structure ok · 1 = gaps listed on stdout · 2 = usage.
//
// Passing this implies spec-lint passes too (an "Kryteria akceptacji" heading plus
// >=2 checkboxes is exactly what spec-lint.mjs demands) — keep that heading wording
// if you touch the templates, or /task's intake gate starts rejecting our own issues.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { SENSITIVE } from './lib/sensitive.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.log('usage: issue-lint.mjs <draft.md>  (file must exist)');
  process.exit(2);
}
const text = readFileSync(file, 'utf8');
const gaps = [];

const COMMON = [
  '## Obszar zmian (code map)',
  '## Kryteria akceptacji',
  '## Przypadki brzegowe',
  '## Pamięć repo',
  '## Plan testów',
  '## Ryzyka i pytania otwarte',
  '## Definicja ukończenia',
];
const BY_TYPE = {
  bug: [
    '## Objaw i oczekiwane zachowanie',
    '## Reprodukcja',
    '## Dowody',
    '## Podejrzana przyczyna',
  ],
  feature: ['## Kontekst', '## Zakres'],
};

// ── type + tier header ──────────────────────────────────────────────────────
const typeMatch = text.match(/\*\*Typ:\*\*\s*(bug|feature)\b/i);
const type = typeMatch?.[1].toLowerCase();
if (!type)
  gaps.push(
    'header: missing `**Typ:** bug` or `**Typ:** feature` (it selects the template and the label)',
  );

// Match the whole token, then demand a single letter — `\b` alone accepts the
// template's own `S|M|L` placeholder (S followed by a non-word char), which is
// exactly the unfilled draft this gate exists to reject.
const tierMatch = text.match(/\*\*Tier:\*\*\s*(\S+)/);
const tier = /^[SML]$/.test(tierMatch?.[1] ?? '') ? tierMatch[1] : undefined;
if (!tier)
  gaps.push(
    'header: missing `**Tier:** S`, `M` or `L` (the literal `S|M|L` from the template does not count)',
  );
if (!/\*\*Obszary:\*\*\s*\S/.test(text)) gaps.push('header: `**Obszary:**` is empty');

if (text.includes('<!--'))
  gaps.push(
    'template hints (`<!-- … -->`) are still in the draft — every section must be filled in and the hint removed',
  );
const todo = text.match(/\b(TODO|TBD|FIXME|XXX)\b/);
if (todo)
  gaps.push(
    `contains a placeholder marker (${todo[1]}) — an issue with an open blank is not ready to be worked on`,
  );

// ── sections ────────────────────────────────────────────────────────────────
const required = [...(BY_TYPE[type] ?? []), ...COMMON];
const sections = {};
for (const name of required) {
  const idx = text.indexOf(`\n${name}`);
  if (idx === -1 && !text.startsWith(name)) {
    gaps.push(`missing section: ${name}`);
    continue;
  }
  const from = idx === -1 ? 0 : idx + 1;
  const rest = text.slice(from + name.length);
  const next = rest.search(/^## /m);
  sections[name] = (next === -1 ? rest : rest.slice(0, next)).trim();
  if (!sections[name]) gaps.push(`${name}: section is empty`);
}

const lines = (name) =>
  (sections[name] ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

// ── acceptance criteria ─────────────────────────────────────────────────────
// Phrases that describe a feeling rather than an observable outcome. Each one is
// paired: say what will be true instead ("returns 403", "spec X is green").
const VAGUE = [
  'działa poprawnie',
  'działa dobrze',
  'poprawnie działa',
  'wszystko działa',
  'bez błędów',
  'jest ok',
  'jest lepiej',
  'ładnie wygląda',
  'wygląda dobrze',
  'itp.',
  'itd.',
];
const acLines = lines('## Kryteria akceptacji').filter((l) => /^[-*]\s*\[[ x]\]/.test(l));
if (sections['## Kryteria akceptacji'] !== undefined) {
  if (acLines.length < 2)
    gaps.push(
      `## Kryteria akceptacji: needs at least 2 checkbox criteria (found ${acLines.length})`,
    );
  for (const l of acLines) {
    const body = l.replace(/^[-*]\s*\[[ x]\]\s*/, '');
    if (body.length < 15)
      gaps.push(`## Kryteria akceptacji: criterion too thin to verify: "${body || '(empty)'}"`);
    const hit = VAGUE.find((v) => body.toLowerCase().includes(v));
    if (hit)
      gaps.push(
        `## Kryteria akceptacji: "${hit}" is not measurable — state the observable outcome instead (exit code, HTTP status, visible state, name of a green spec): "${body}"`,
      );
  }
}

// ── code map: every path must exist on disk ─────────────────────────────────
// Two accepted shapes, because the section is read by humans as often as by this
// script: a bullet list (`- path — what changes`) or a two-column table
// (`| path | what changes |`). Both carry the same information; only the path
// extraction differs, so everything downstream stays shared.
const TABLE_SEPARATOR = /^\|[\s:|-]+\|?\s*$/;

/** First cell of a table row, or null for the header/separator rows. */
function tableCell(line) {
  const cells = line
    .replace(/^\|/, '')
    .replace(/\|\s*$/, '')
    .split('|');
  return cells.length ? cells[0].trim() : null;
}

const sectionLines = lines('## Obszar zmian (code map)');
const separatorAt = sectionLines.findIndex((l) => TABLE_SEPARATOR.test(l));
// Rows at or above the separator are the table head; a table without a separator
// is not a table at all, so nothing is skipped in the bullet-list case.
const mapLines = sectionLines.filter(
  (l, i) => /^[-*]\s/.test(l) || (l.startsWith('|') && separatorAt !== -1 && i > separatorAt),
);
if (sections['## Obszar zmian (code map)'] !== undefined && !mapLines.length)
  gaps.push(
    '## Obszar zmian (code map): no change sites — use `- path — what changes` lines or a `| path | what changes |` table',
  );

const mapped = [];
for (const l of mapLines) {
  // The path is the first whitespace-delimited token: repo paths never contain
  // spaces, while everything after it (a description, a `(nowy plik: x.ts)`
  // annotation) does — splitting on the dash instead swallowed the annotation
  // into the path and reported a bogus "does not exist".
  const cell = l.startsWith('|') ? (tableCell(l) ?? '') : l.replace(/^[-*]\s*/, '');
  const raw = cell
    .split(/\s+/)[0]
    .replace(/[`'"]/g, '')
    .replace(/[,;:]$/, '')
    .trim();
  if (!raw) continue;
  const path = raw.replace(/\\/g, '/').replace(/\/$/, '');
  if (!/[/.]/.test(path)) {
    gaps.push(
      `## Obszar zmian: "${raw}" does not look like a path — write a repo-relative path, not a description`,
    );
    continue;
  }
  mapped.push(path);
  const abs = join(root, path);
  if (!existsSync(abs)) {
    gaps.push(
      `## Obszar zmian: path does not exist: ${path} — for a file that will be created, point at its existing directory instead (\`dir/ (nowy plik: x.ts)\`)`,
    );
    continue;
  }
  // A bare directory is only a change site when the line says what will be created
  // in it; otherwise it is an imprecise pointer at a whole subtree.
  if (statSync(abs).isDirectory() && !/\(nowy plik/i.test(l)) {
    gaps.push(
      `## Obszar zmian: ${path} is a directory — name the file, or annotate it \`${path}/ (nowy plik: nazwa.ts)\``,
    );
  }
}

// ── tier vs the shared sensitive list ───────────────────────────────────────
const hits = mapped.filter((p) => SENSITIVE.some((re) => re.test(p)));
if (hits.length && tier && tier !== 'L') {
  gaps.push(
    `tier ${tier} but the code map touches areas that are always L (${hits.join(', ')}) — raise the tier; tier-guard.mjs will force it during implementation anyway`,
  );
}
// ── bug-specific substance ──────────────────────────────────────────────────
if (type === 'bug') {
  const repro = lines('## Reprodukcja');
  if (sections['## Reprodukcja'] !== undefined && !repro.some((l) => /^\d+[.)]\s+\S/.test(l)))
    gaps.push(
      '## Reprodukcja: needs numbered steps (`1.`, `2.`, …) — a paragraph is not a reproduction',
    );
  if ((sections['## Dowody'] ?? '').length < 20)
    gaps.push(
      '## Dowody: too thin — paste the actual output, log line or failing spec name (run it, do not predict it)',
    );
}

// ── memory section must be a real answer ────────────────────────────────────
const memory = sections['## Pamięć repo'] ?? '';
if (memory && memory.length < 25 && !/brak\s+—\s+sprawdzono/i.test(memory))
  gaps.push('## Pamięć repo: write the hits, or the explicit `brak — sprawdzono <słowa kluczowe>`');

if (gaps.length) {
  console.log(
    `[issue-lint] DRAFT NOT READY (${type ?? 'unknown type'}) — fix before creating the issue:`,
  );
  for (const g of gaps) console.log(`  - ${g}`);
  process.exit(1);
}
console.log(
  `[issue-lint] structure ok — type=${type}, tier=${tier}, ${acLines.length} criteria, ${mapped.length} code-map paths all exist.`,
);
process.exit(0);
