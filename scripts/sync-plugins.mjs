#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

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
