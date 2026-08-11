#!/usr/bin/env node
/**
 * Design-system guard — enforces docs/DESIGN-SYSTEM.md §2/§10 mechanically.
 * Fails when apps/web sources contain color values outside the token system
 * or banned APIs. Runs in CI (test:web) and locally via `pnpm lint:design`.
 *
 * Not a linter plugin on purpose: zero deps, runs anywhere node runs.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SCAN_DIR = join(ROOT, 'apps/web/src');
const EXTENSIONS = /\.(vue|ts)$/;

/** Files allowed to contain raw color values (the token definitions themselves) */
const EXEMPT = new Set([
  'apps/web/src/style.css', // not scanned (not .vue/.ts) — listed for clarity
  // Stage palette constants hold hex strings persisted to the DB — values, not styles:
  'apps/web/src/views/pipeline/PipelineStagesView.vue',
]);

const RULES = [
  {
    name: 'arbitrary color utility',
    hint: 'Use a semantic token class (docs/DESIGN-SYSTEM.md §2); add a token if one is missing.',
    // bg-[#…], text-[rgba(…)], border-[rgb(…)] … in any variant chain
    pattern:
      /\b[\w:.[\]-]*(?:bg|text|border|ring|placeholder|divide|from|to|via|outline|caret|fill|stroke|shadow|decoration|accent)-\[(?:#|rgba?\()/g,
  },
  {
    name: 'built-in Tailwind palette',
    hint: 'Palette classes bypass theming. Use semantic tokens (text-danger, bg-surface-…).',
    pattern:
      /\b[\w:.[\]-]*(?:bg|text|border|ring|placeholder|divide|from|to|via|outline|caret|fill|stroke|decoration|accent)-(?:red|rose|amber|yellow|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|gray|zinc|neutral|slate|stone|orange|lime)-\d{2,3}(?:\/\d{1,3})?\b/g,
  },
  {
    name: 'native confirm()',
    hint: 'Use useConfirm() from src/composables/useConfirm.ts (docs/DESIGN-SYSTEM.md §5).',
    pattern: /(?:window\.)?\bconfirm\(/g,
  },
  {
    name: 'theme branching in components',
    hint: 'Never branch on the active theme — fix the token value instead (docs/DESIGN-SYSTEM.md §9).',
    pattern: /data-theme.*(?:===|!==)|dataset\.theme\s*(?:===|!==)/g,
  },
  {
    name: 'native date input',
    hint: 'Use AppDatePicker / AppDateRangePicker (docs/DESIGN-SYSTEM.md §6, ADR-0012) — a native picker draws its own glyph and panel, which no token can reach.',
    // Anchored on the attribute, not on `<input`: this guard reads one line at a
    // time, and a multi-line tag would slip past a `<input[^>]*type=…` pattern.
    pattern: /\btype=["'](?:date|datetime-local|time|month|week)["']/g,
  },
];

/** Allowed within otherwise-banned patterns (checked per match) */
const MATCH_ALLOWLIST = [
  /^useConfirm\($/, // safety; \bconfirm\( should not match this anyway
];

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (EXTENSIONS.test(entry.name)) yield path;
  }
}

// The theme composable/tests legitimately read dataset.theme
const THEME_EXEMPT = /composables[\\/]useTheme(\.spec)?\.ts$/;
// useConfirm defines the sanctioned alternative (docstring shows usage)
const CONFIRM_EXEMPT = /composables[\\/]useConfirm\.ts$/;

let failures = 0;

for (const file of walk(SCAN_DIR)) {
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  if (EXEMPT.has(rel)) continue;
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');

  for (const rule of RULES) {
    if (rule.name === 'theme branching in components' && THEME_EXEMPT.test(file)) continue;
    if (rule.name === 'native confirm()' && CONFIRM_EXEMPT.test(file)) continue;
    for (let i = 0; i < lines.length; i++) {
      const matches = lines[i].match(rule.pattern);
      if (!matches) continue;
      const real = matches.filter((m) => !MATCH_ALLOWLIST.some((a) => a.test(m)));
      if (!real.length) continue;
      failures++;
      console.error(`${rel}:${i + 1} — ${rule.name}: ${real.join(', ')}`);
      console.error(`  ↳ ${rule.hint}`);
    }
  }
}

if (failures) {
  console.error(`\ndesign-guard: ${failures} violation(s). See docs/DESIGN-SYSTEM.md.`);
  process.exit(1);
}
console.log('design-guard: OK — no token violations in apps/web/src');
