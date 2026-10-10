#!/usr/bin/env node
/**
 * Sync one or more local ADRs (docs/adr/NNNN-*.md) to Pokelo as type=ADR.
 *
 * Usage:
 *   node scripts/adr-sync-to-pokelo.mjs                 # all numbered ADRs
 *   node scripts/adr-sync-to-pokelo.mjs 0053            # by number
 *   node scripts/adr-sync-to-pokelo.mjs docs/adr/0053-….md
 *
 * Auth: pokelo CLI config (~/.config/pokelo/config.json) or
 *       POKELO_URL + POKELO_TOKEN (+ optional POKELO_PROJECT).
 * Default project: Khirby (d5fb3b0f-a5e5-44ca-9ec0-d3cc4f50963a).
 *
 * Never creates Note/docs-folder ADRs — ADRs are a separate Pokelo entity.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const ADR_DIR = join(REPO_ROOT, 'docs/adr');
const PROJECT =
  process.env.POKELO_PROJECT ||
  process.env.POKELO_PROJECT_ID ||
  'd5fb3b0f-a5e5-44ca-9ec0-d3cc4f50963a';

function fail(msg) {
  console.error(`adr-sync-to-pokelo: ${msg}`);
  process.exit(1);
}

function loadEnvToken() {
  const envPath = join(REPO_ROOT, '.env');
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^(POKELO_TOKEN|POKELO_URL|POKELO_PROJECT_ID|POKELO_PROJECT)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

function pokelo(args, { input } = {}) {
  const envFile = loadEnvToken();
  const env = {
    ...process.env,
    ...(envFile.POKELO_TOKEN ? { POKELO_TOKEN: envFile.POKELO_TOKEN } : {}),
    ...(envFile.POKELO_URL ? { POKELO_URL: envFile.POKELO_URL } : {}),
    POKELO_PROJECT: PROJECT,
  };
  const r = spawnSync('pokelo', [...args, '--project', PROJECT], {
    encoding: 'utf8',
    env,
    input,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (r.error) fail(`pokelo not runnable (${r.error.message}). Install: npm i -g @pokelo/cli`);
  if (r.status !== 0) {
    fail(`pokelo ${args.join(' ')} failed:\n${r.stderr || r.stdout}`);
  }
  const text = (r.stdout || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    fail(`pokelo returned non-JSON:\n${text.slice(0, 400)}`);
  }
}

function listLocalFiles(selectors) {
  const all = readdirSync(ADR_DIR)
    .filter((n) => /^\d{4}-.+\.md$/.test(n))
    .map((n) => join(ADR_DIR, n))
    .sort();
  if (!selectors.length) return all;
  const out = [];
  for (const sel of selectors) {
    if (/^\d{1,4}$/.test(sel)) {
      const n = sel.padStart(4, '0');
      const hit = all.find((p) => basename(p).startsWith(`${n}-`));
      if (!hit) fail(`no local ADR ${n}`);
      out.push(hit);
      continue;
    }
    const p = resolve(sel);
    if (!existsSync(p)) fail(`file not found: ${sel}`);
    out.push(p);
  }
  return out;
}

function titleFromMd(md, fallback) {
  const h = md.match(/^#\s+(.+)$/m);
  return (h ? h[1].trim() : fallback).trim();
}

function apiStatus(md) {
  const line = (md.match(/\*\*Status:\*\*\s*(.+)/) || [])[1] || '';
  // Only fully superseded — not "Accepted — … superseded by …"
  if (/^\s*Superseded\b/i.test(line)) return 'deprecated';
  return 'approved';
}

function extractId(md) {
  const m = md.match(/\*\*Pokelo ADR id:\*\*\s*`([0-9a-f-]{36})`/i);
  return m ? m[1] : null;
}

function ensureIdLine(md, id) {
  const line = `- **Pokelo ADR id:** \`${id}\` (Khirby project)`;
  if (/Pokelo ADR id/.test(md)) {
    return md.replace(/- \*\*Pokelo ADR id:\*\*.*\n/, `${line}\n`);
  }
  if (/\*\*Deciders:\*\*/.test(md)) {
    return md.replace(/(- \*\*Deciders:\*\*.*\n)/, `$1${line}\n`);
  }
  if (/\*\*Date:\*\*/.test(md)) {
    return md.replace(/(- \*\*Date:\*\*.*\n)/, `$1${line}\n`);
  }
  return md.replace(/(- \*\*Status:\*\*.*\n)/, `$1${line}\n`);
}

function norm(s) {
  return s.replace(/\r\n/g, '\n').trim() + '\n';
}

function writeTemp(md) {
  const p = join(REPO_ROOT, `.adr-sync-${process.pid}.md`);
  writeFileSync(p, md);
  return p;
}

function syncFile(filepath) {
  let md = readFileSync(filepath, 'utf8');
  const base = basename(filepath);
  const num = base.slice(0, 4);
  const title = titleFromMd(md, base);
  const status = apiStatus(md);
  let id = extractId(md);
  let action;

  if (!id) {
    const tmp = writeTemp(md.replace(/- \*\*Pokelo ADR id:\*\*.*\n/, ''));
    try {
      const created = pokelo([
        'docs',
        'create',
        '--title',
        title,
        '--type',
        'ADR',
        '--status',
        status,
        '--content-file',
        tmp,
      ]);
      id = created.id;
      action = 'created';
    } finally {
      try {
        writeFileSync(tmp, ''); // ensure unlink below
      } catch {
        /* ignore */
      }
      spawnSync('rm', ['-f', tmp]);
    }
    md = ensureIdLine(md, id);
    const tmp2 = writeTemp(md);
    try {
      pokelo([
        'docs',
        'update',
        id,
        '--content-file',
        tmp2,
        '--type',
        'ADR',
        '--status',
        status,
        '--title',
        title,
      ]);
    } finally {
      spawnSync('rm', ['-f', tmp2]);
    }
    writeFileSync(filepath, md);
  } else {
    md = ensureIdLine(md, id);
    const remote = pokelo(['docs', 'get', id]);
    const body = {
      needType: remote.type !== 'ADR',
      needStatus: remote.status !== status,
      needTitle: remote.title !== title,
      needContent: norm(remote.contentMd || '') !== norm(md),
    };
    if (!body.needType && !body.needStatus && !body.needTitle && !body.needContent) {
      if (readFileSync(filepath, 'utf8') !== md) writeFileSync(filepath, md);
      action = 'unchanged';
    } else {
      const tmp = writeTemp(md);
      try {
        const args = [
          'docs',
          'update',
          id,
          '--content-file',
          tmp,
          '--type',
          'ADR',
          '--status',
          status,
          '--title',
          title,
        ];
        pokelo(args);
      } finally {
        spawnSync('rm', ['-f', tmp]);
      }
      writeFileSync(filepath, md);
      action = 'updated';
    }
  }

  const urlGuess = `https://rag.bearly.pro`; // UI host may differ; id is the durable ref
  console.log(`${action.padEnd(10)} ${num}  ${id}  ${title}`);
  return { action, id, num, title, urlGuess };
}

const selectors = process.argv.slice(2);
const files = listLocalFiles(selectors);
if (!files.length) fail('no ADR files to sync');

// Verify CLI
const which = spawnSync('pokelo', ['auth', 'status'], { encoding: 'utf8' });
if (which.status !== 0 && !process.env.POKELO_TOKEN && !loadEnvToken().POKELO_TOKEN) {
  fail('pokelo not authenticated. Run `pokelo auth login` or set POKELO_TOKEN in .env');
}

const summary = { created: 0, updated: 0, unchanged: 0 };
for (const f of files) {
  const r = syncFile(f);
  summary[r.action] = (summary[r.action] || 0) + 1;
}
console.log(
  `\nDone. created=${summary.created || 0} updated=${summary.updated || 0} unchanged=${summary.unchanged || 0}`,
);
