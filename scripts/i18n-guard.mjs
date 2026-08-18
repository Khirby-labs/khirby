#!/usr/bin/env node
/**
 * i18n guard — enforces `.claude/rules/i18n.md` mechanically (ADR-0011).
 * Runs in CI via `pnpm verify` and locally via `pnpm lint:i18n`.
 *
 * Four jobs:
 *   1. Locale parity — every registered locale has the same files and the same
 *      keys as `en`, with no empty values. A missing translation is a red gate,
 *      not a silent production fallback.
 *   2. Context coverage — keys whose intent a key path can't convey must have a
 *      note, or whoever writes the next language has only English to copy.
 *   3. Polish copy checks — straight quotes and Title Case. Both are real errors
 *      no reviewer catches reliably across hundreds of strings.
 *   4. Ratchet — files already migrated (I18N_ENFORCED) must not regrow literal
 *      UI text. Files not yet migrated are skipped, so coverage only grows.
 *
 * Not a linter plugin on purpose: zero deps, runs anywhere node runs — same
 * shape as scripts/design-guard.mjs.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const WEB_SRC = join(ROOT, 'apps/web/src');
const MESSAGES = join(WEB_SRC, 'i18n/messages');
const CONTEXT = join(MESSAGES, '_context');
const LOCALES_TS = join(WEB_SRC, 'i18n/locales.ts');
const SOURCE_OF_TRUTH = 'en';

/**
 * Files whose user-facing text has been migrated to t(). Each session appends
 * its own; nothing is ever removed. Until a file is listed, it is not scanned —
 * that is what makes a phased migration safe instead of a 650-string big bang.
 */
const I18N_ENFORCED = [
  // S1 — foundation
  'apps/web/src/views/settings/SettingsView.vue',
  'apps/web/src/views/settings/SettingsLayout.vue',
  // S3 — app shell & navigation
  'apps/web/src/components/shell/AppSidebar.vue',
  'apps/web/src/components/shell/AppTopbar.vue',
  'apps/web/src/components/shell/CommandPalette.vue',
  'apps/web/src/components/shell/QuickCreateMenu.vue',
  'apps/web/src/components/shell/AccountMenu.vue',
  // S4 — shared primitives
  'apps/web/src/components/AppModal.vue',
  'apps/web/src/components/AppPagination.vue',
  'apps/web/src/components/AppTable.vue',
  'apps/web/src/components/PluginConfigForm.vue',
  'apps/web/src/components/ListmonkStatusBadge.vue',
  'apps/web/src/components/ui/AppSelect.vue',
  'apps/web/src/components/ui/FormField.vue',
  'apps/web/src/components/ui/SkeletonRows.vue',
  // S5 — Contacts
  'apps/web/src/views/contacts/ContactsView.vue',
  'apps/web/src/views/contacts/ContactDetailView.vue',
  // S6 — Pipeline
  'apps/web/src/views/pipeline/PipelineView.vue',
  'apps/web/src/views/pipeline/PipelineStagesView.vue',
  'apps/web/src/components/pipeline/AddLeadModal.vue',
  'apps/web/src/components/pipeline/LeadDetailPanel.vue',
  'apps/web/src/components/pipeline/LeadCard.vue',
  // S7 — Forms
  'apps/web/src/views/forms/FormsView.vue',
  'apps/web/src/views/forms/FormDetailView.vue',
  'apps/web/src/views/forms/FormsAnalyticsView.vue',
  'apps/web/src/components/forms/FormPreview.vue',
  'apps/web/src/components/forms/IntegrationPanel.vue',
  'apps/web/src/stores/forms.store.ts',
  'apps/web/src/utils/form-field-templates.ts',
  // S8 — admin & auth
  'apps/web/src/views/users/UsersView.vue',
  'apps/web/src/views/roles/RolesView.vue',
  'apps/web/src/views/plugins/PluginsView.vue',
  'apps/web/src/views/newsletter/NewsletterView.vue',
  'apps/web/src/views/auth/LoginView.vue',
  'apps/web/src/views/NotFoundView.vue',
  // S9 — backend-served labels, per-account locale, document.title
  'apps/web/src/App.vue',
  // Listed as documentation, not enforcement: the ratchet parses <template> only,
  // so a file without one is recorded here as migrated and scanned for nothing.
  'apps/web/src/i18n/server-text.ts',
  'apps/web/src/composables/useServerText.ts',
  'apps/web/src/composables/useDocumentTitle.ts',
  'apps/web/src/composables/useLocale.ts',
  'apps/web/src/stores/auth.store.ts',
  // Date pickers (ADR-0012). AppPopover and AppCalendar carry no copy of their own —
  // month and weekday names come from Intl — but they are listed so a literal added
  // later fails here instead of shipping.
  'apps/web/src/components/ui/AppPopover.vue',
  'apps/web/src/components/ui/AppCalendar.vue',
  'apps/web/src/components/ui/AppDatePicker.vue',
  'apps/web/src/components/ui/AppDateRangePicker.vue',
  // KBY-107 — Marketplace
  'apps/web/src/views/marketplace/MarketplaceView.vue',
  // Documentation, not enforcement, like the group above: the ratchet parses
  // <template> only, so listing a .ts file scans nothing. It is recorded here
  // because the store deliberately holds error CODES rather than sentences — the
  // audit of this feature found a hardcoded English fallback that listing the file
  // did not, and could not, catch.
  'apps/web/src/stores/marketplace.store.ts',
];

/**
 * Sources that declare message keys for the SPA to resolve. A plugin ships a
 * stable `*Key` next to its English literal (ADR-0011), and a third-party plugin's
 * unknown key legitimately falls back to that literal — but a key declared *in
 * this repo* and missing from `en/` is a typo the fallback would hide, which is
 * exactly the closed, enumerable set the key rules allow a guard to check.
 */
// `examples` is here for the same reason: the fixture plugin declares
// displayNameKey/descriptionKey and is built from this repository, so a typo in one
// of its keys is a bug the literal fallback would hide.
const KEY_DECLARING_SOURCES = ['plugins', 'packages', 'examples'];

const DECLARED_KEY_FIELDS = ['labelKey', 'descriptionKey', 'displayNameKey', 'navLabelKey'];

/** Attributes whose literal value is read or announced to a user. */
const TRANSLATABLE_ATTRS = [
  'placeholder',
  'aria-label',
  'aria-description',
  'title',
  'alt',
  'label',
  'hint',
  'description',
  'caption',
  'empty-text',
  'confirm-label',
  'cancel-label',
];

/**
 * Text that is a brand, a keyboard key or an identifier — never translated.
 * Key names (`Esc`, `Ctrl`) are printed on the reader's keyboard in Latin script
 * whatever their language, so translating them would mislead.
 */
const NOT_COPY = new Set([
  'CRM',
  'Khirby',
  'Khirby CRM',
  'px',
  'ID',
  'URL',
  'API',
  'Esc',
  'Ctrl',
  'Alt',
  'Shift',
  'Tab',
  'Enter',
]);

/**
 * Words allowed to start with a capital mid-string in `pl`: proper nouns, brands
 * and the glossary's deliberate anglicisms. Extend this rather than weakening
 * the Title-Case check.
 */
const PL_PROPER_NOUNS = new Set([
  'Khirby',
  'CRM',
  'Listmonk',
  'Polski',
  'English',
  'JSON',
  'SDK',
  'API',
  'URL',
  'ID',
  'Webhook',
  'Newsletter',
  'Pipeline',
  'MCP',
  'Claude',
  'Code', // product name "Claude Code"
  'Cursor',
  'Hermes',
  'AI',
  'Compose', // product name "AI Compose"
  'Pokelo',
  'Google',
  'Gmail',
  'Hello', // package name of the example plugin (crm-plugin-hello)
  'Marketplace', // product surface name, established in Polish
]);

const LETTER = 'A-Za-zÀ-ÖØ-öø-ÿĄĆĘŁŃÓŚŹŻąćęłńóśźż';

let failures = 0;
function fail(where, message, hint) {
  failures++;
  console.error(`${where} — ${message}`);
  if (hint) console.error(`  ↳ ${hint}`);
}

// ─── Registry ────────────────────────────────────────────────────────────────

function registeredLocales() {
  const src = readFileSync(LOCALES_TS, 'utf8');
  const block = src.slice(src.indexOf('SUPPORTED_LOCALES'));
  return [...block.matchAll(/code:\s*'([a-z]{2,3}(?:-[A-Za-z]+)?)'/g)].map((m) => m[1]);
}

// ─── Message trees ───────────────────────────────────────────────────────────

function jsonFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
}

function flatten(value, prefix = '', out = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, path, out);
    else out.set(path, child);
  }
  return out;
}

function readNamespace(locale, file) {
  const path = join(MESSAGES, locale, file);
  try {
    return flatten(JSON.parse(readFileSync(path, 'utf8')));
  } catch (e) {
    fail(`apps/web/src/i18n/messages/${locale}/${file}`, `unreadable JSON: ${e.message}`);
    return new Map();
  }
}

// ─── 1 + 2 + 3: parity, context coverage, Polish copy ────────────────────────

const locales = registeredLocales();
if (!locales.includes(SOURCE_OF_TRUTH)) {
  fail('apps/web/src/i18n/locales.ts', `'${SOURCE_OF_TRUTH}' is not registered`);
}

const sourceFiles = jsonFiles(join(MESSAGES, SOURCE_OF_TRUTH));
if (!sourceFiles.length) fail('apps/web/src/i18n/messages/en', 'no namespace files found');

for (const locale of locales) {
  if (locale === SOURCE_OF_TRUTH) continue;
  const dir = join(MESSAGES, locale);
  if (!existsSync(dir)) {
    fail(
      `apps/web/src/i18n/messages/${locale}`,
      'registered in SUPPORTED_LOCALES but has no messages directory',
      'A locale ships complete or is not registered (ADR-0011).',
    );
    continue;
  }
  const files = jsonFiles(dir);
  for (const missing of sourceFiles.filter((f) => !files.includes(f))) {
    fail(`apps/web/src/i18n/messages/${locale}/${missing}`, 'namespace missing in this locale');
  }
  for (const extra of files.filter((f) => !sourceFiles.includes(f))) {
    fail(
      `apps/web/src/i18n/messages/${locale}/${extra}`,
      `namespace has no counterpart in ${SOURCE_OF_TRUTH}/`,
    );
  }
}

/** Keys whose intent is not recoverable from the path alone need a context note. */
function needsContext(key, value) {
  if (typeof value !== 'string') return false;
  if (value.includes('{') || value.includes('|')) return true; // params or plurals
  return value.trim().split(/\s+/).length <= 2; // short, ambiguous labels
}

for (const file of sourceFiles) {
  const source = readNamespace(SOURCE_OF_TRUTH, file);
  const contextPath = join(CONTEXT, file);
  const context = existsSync(contextPath)
    ? flatten(JSON.parse(readFileSync(contextPath, 'utf8')))
    : new Map();

  for (const [key, value] of source) {
    if (typeof value === 'string' && value.trim() === '') {
      fail(
        `apps/web/src/i18n/messages/${SOURCE_OF_TRUTH}/${file}`,
        `empty value at '${key}'`,
        'An empty translation is a missing one that fallback hides.',
      );
    }
    if (needsContext(key, value) && !context.has(key)) {
      fail(
        `apps/web/src/i18n/messages/_context/${file}`,
        `no intent recorded for '${key}'`,
        'Params, plurals and one-or-two-word labels need a note, or the next language gets copied from English.',
      );
    }
  }

  for (const locale of locales) {
    if (locale === SOURCE_OF_TRUTH) continue;
    if (!existsSync(join(MESSAGES, locale, file))) continue;
    const target = readNamespace(locale, file);

    for (const key of source.keys()) {
      if (!target.has(key)) {
        fail(`apps/web/src/i18n/messages/${locale}/${file}`, `missing key '${key}'`);
      }
    }
    for (const key of target.keys()) {
      if (!source.has(key)) {
        fail(
          `apps/web/src/i18n/messages/${locale}/${file}`,
          `orphan key '${key}' — not present in ${SOURCE_OF_TRUTH}/`,
        );
      }
    }

    for (const [key, value] of target) {
      if (typeof value !== 'string') continue;
      const where = `apps/web/src/i18n/messages/${locale}/${file}`;
      if (value.trim() === '') {
        fail(where, `empty value at '${key}'`);
        continue;
      }
      if (value.includes('...')) {
        fail(where, `'${key}' uses three dots`, 'Use the ellipsis character … instead.');
      }
      if (locale === 'pl') checkPolish(where, key, value);
      if (locale === 'en' && value.includes('„')) {
        fail(where, `'${key}' uses Polish quotes`, 'English copy uses "…".');
      }
    }
  }
}

function checkPolish(where, key, value) {
  if (value.includes('"')) {
    fail(where, `'${key}' contains a straight quote`, 'Polish copy uses „…" (U+201E / U+201D).');
  }
  // Title Case: a capitalised word that is not the first, not a proper noun and
  // not an acronym. Restricted to short, punctuation-free values so prose
  // containing a real proper noun is not flagged.
  const words = value.trim().split(/\s+/);
  if (words.length < 2 || words.length > 5) return;
  if (/[.!?:]/.test(value)) return;
  const offenders = words
    .slice(1)
    .map((w) => w.replace(new RegExp(`[^${LETTER}]`, 'g'), ''))
    .filter((w) => w.length > 1)
    .filter((w) => w !== w.toUpperCase())
    .filter((w) => !PL_PROPER_NOUNS.has(w))
    .filter((w) => w[0] === w[0].toUpperCase());
  if (offenders.length) {
    fail(
      where,
      `'${key}' looks like Title Case: ${offenders.join(', ')}`,
      'Polish uses sentence case, buttons included. Add a real proper noun to PL_PROPER_NOUNS in this script.',
    );
  }
}

// ─── 4: ratchet over migrated files ──────────────────────────────────────────

/** Replace a matched region with spaces so line/column numbers stay accurate. */
function blank(text, pattern) {
  return text.replace(pattern, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * Blank out every tag, honouring quoted attribute values.
 *
 * A regex cannot do this: `@select="() => go()"` contains `>`, so `<[^>]*>`
 * stops inside the attribute and the rest of the tag leaks out as "text" —
 * which is exactly the false positive that would get this guard disabled.
 */
function blankTags(text) {
  const out = [...text];
  let i = 0;
  while (i < out.length) {
    if (out[i] !== '<') {
      i++;
      continue;
    }
    let j = i + 1;
    let quote = null;
    while (j < out.length) {
      const ch = out[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        break;
      }
      j++;
    }
    for (let k = i; k <= Math.min(j, out.length - 1); k++) {
      if (out[k] !== '\n') out[k] = ' ';
    }
    i = j + 1;
  }
  return out.join('');
}

function scanTemplate(relPath) {
  const abs = join(ROOT, relPath);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    fail(relPath, 'listed in I18N_ENFORCED but not found', 'Remove the stale entry.');
    return;
  }
  const source = readFileSync(abs, 'utf8');
  const open = source.indexOf('<template');
  const close = source.lastIndexOf('</template>');
  if (open === -1 || close === -1) return;

  const head = source.slice(0, open).split('\n').length - 1;
  const template = source.slice(open, close);

  // Lines exempted by an `i18n-ignore` comment (that line and the next).
  const exempt = new Set();
  template.split('\n').forEach((line, i) => {
    if (/<!--[^>]*i18n-ignore/.test(line)) {
      exempt.add(head + i + 1);
      exempt.add(head + i + 2);
    }
  });

  // Literal values on translatable attributes (bound ones are fine).
  const attrPattern = new RegExp(`(^|[\\s])(${TRANSLATABLE_ATTRS.join('|')})="([^"]*)"`, 'g');
  for (const match of template.matchAll(attrPattern)) {
    const value = match[3];
    if (!new RegExp(`[${LETTER}]{2,}`).test(value)) continue;
    if (NOT_COPY.has(value.trim())) continue;
    const line = head + template.slice(0, match.index).split('\n').length;
    fail(
      `${relPath}:${line}`,
      `literal ${match[2]}="${value}"`,
      'Bind it to a message: :aria-label="t(\'…\')".',
    );
  }

  // Residual text nodes: strip comments, mustaches and tags, keep geometry.
  let text = blank(template, /<!--[\s\S]*?-->/g);
  text = blank(text, /\{\{[\s\S]*?\}\}/g);
  text = blankTags(text);
  text.split('\n').forEach((line, i) => {
    const lineNo = head + i + 1;
    if (exempt.has(lineNo)) return;
    const words = line.match(new RegExp(`[${LETTER}]{2,}`, 'g'));
    if (!words) return;
    const real = words.filter((w) => !NOT_COPY.has(w));
    if (!real.length) return;
    fail(
      `${relPath}:${lineNo}`,
      `literal text in template: ${real.join(' ')}`,
      "Move it into a message and render {{ t('…') }}, or mark the line with an i18n-ignore comment.",
    );
  });
}

for (const file of I18N_ENFORCED) scanTemplate(file);

// ─── 5: every t() key exists ─────────────────────────────────────────────────
//
// vue-i18n's typed messages give autocomplete, but its `t(key: string)` overload
// still accepts anything, so `vue-tsc` does NOT catch a typo'd key — verified,
// not assumed. `satisfies MessageSchema` gates locale *completeness* at the
// compiler; key *existence* is gated here.

function allSourceKeys() {
  const keys = new Set();
  for (const file of sourceFiles) {
    const namespace = file.replace(/\.json$/, '');
    for (const key of readNamespace(SOURCE_OF_TRUTH, file).keys()) {
      keys.add(`${namespace}.${key}`);
    }
  }
  return keys;
}

function* walkWebSources(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkWebSources(path);
    else if (/\.(vue|ts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) yield path;
  }
}

const knownKeys = allSourceKeys();
// t('a.b.c') / $t("a.b.c") / d(x, 'name') is excluded — only message keys here.
const T_CALL = /\$?\bt\(\s*(['"])([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)\1/g;

for (const abs of walkWebSources(WEB_SRC)) {
  const rel = relative(ROOT, abs).replaceAll('\\', '/');
  if (rel.includes('/i18n/messages/')) continue;
  const lines = readFileSync(abs, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const match of line.matchAll(T_CALL)) {
      const key = match[2];
      if (knownKeys.has(key)) continue;
      // Ignore paths that are plainly not message keys (event names, selectors).
      if (!key.startsWith('common.') && !sourceFiles.includes(`${key.split('.')[0]}.json`)) {
        continue;
      }
      fail(
        `${rel}:${i + 1}`,
        `t('${key}') has no message in ${SOURCE_OF_TRUTH}/`,
        'Add the key (and its pl counterpart) or fix the typo.',
      );
    }
  });
}

// ─── 6: keys declared outside apps/web resolve too ───────────────────────────
//
// The backend ships identifiers, the SPA owns the copy. Nothing else checks that
// the two halves meet: a mistyped `labelKey` renders the English literal, so the
// screen looks merely untranslated rather than broken, in both locales.

function* walkTsSources(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkTsSources(path);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) yield path;
  }
}

const DECLARED_KEY = new RegExp(`\\b(${DECLARED_KEY_FIELDS.join('|')})\\s*:\\s*'([^']+)'`, 'g');

for (const source of KEY_DECLARING_SOURCES) {
  for (const abs of walkTsSources(join(ROOT, source))) {
    const rel = relative(ROOT, abs).replaceAll('\\', '/');
    readFileSync(abs, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        for (const match of line.matchAll(DECLARED_KEY)) {
          const [, field, key] = match;
          if (knownKeys.has(key)) continue;
          fail(
            `${rel}:${i + 1}`,
            `${field}: '${key}' has no message in ${SOURCE_OF_TRUTH}/`,
            'Add the key (and its pl counterpart), or the SPA silently renders the English literal.',
          );
        }
      });
  }
}

// ─── Report ──────────────────────────────────────────────────────────────────

if (failures) {
  console.error(`\ni18n-guard: ${failures} problem(s). See .claude/rules/i18n.md.`);
  process.exit(1);
}
console.log(
  `i18n-guard: OK — ${locales.join('/')} in parity across ${sourceFiles.length} namespace(s), ` +
    `${I18N_ENFORCED.length} migrated file(s) clean, ` +
    `keys declared in ${KEY_DECLARING_SOURCES.join('/')} all resolve`,
);
