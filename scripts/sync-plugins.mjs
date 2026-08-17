#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

/** Load root .env so KHIRBY_PLUGINS_WORKSPACE=1 in .env is visible to sync scripts. */
function loadRootEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadRootEnv();

function run(script) {
  const r = spawnSync(process.execPath, [join(root, 'scripts', script)], {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('sync-plugin-deps.mjs');
run('vendor-plugins-for-build.mjs');
run('generate-plugin-loader.mjs');
