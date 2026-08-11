#!/usr/bin/env node
/** Copy npm plugin sources into plugins/ for Nest compile (skip if plugins/.git). */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  realpathSync,
} from 'fs';
import { createRequire } from 'module';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const pluginsRoot = join(root, 'plugins');
const manifestPath = join(root, 'plugins.manifest.json');

const PACKAGE_TO_DIR = {
  '@khirby/plugin-webhook': 'crm-plugin-webhook',
  '@khirby/plugin-discord': 'crm-plugin-discord',
  '@khirby/plugin-listmonk': 'crm-plugin-listmonk',
  '@khirby/plugin-mcp': 'crm-plugin-mcp',
  '@khirby/plugin-ai-compose': 'crm-plugin-ai-compose',
  '@khirby/plugin-pokelo': 'crm-plugin-pokelo',
};

function resolvePackageRoot(packageName) {
  const segments = packageName.split('/');
  const candidates = [
    join(root, 'apps/api', 'node_modules', ...segments),
    join(root, 'node_modules', ...segments),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'package.json'))) {
      return realpathSync(c);
    }
  }

  const require = createRequire(join(root, 'apps/api/package.json'));
  const entry = require.resolve(packageName);
  let dir = dirname(entry);
  while (dir !== '/' && !existsSync(join(dir, 'package.json'))) {
    dir = dirname(dir);
  }
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  if (pkg.name !== packageName) {
    throw new Error(`Resolved ${packageName} to unexpected package ${pkg.name} at ${dir}`);
  }
  return dir;
}

function isProtectedCheckout() {
  return process.env.KHIRBY_PLUGINS_WORKSPACE === '1' || existsSync(join(pluginsRoot, '.git'));
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const plugins = manifest.plugins;
if (!Array.isArray(plugins)) {
  console.error('Invalid plugins.manifest.json');
  process.exit(1);
}

if (isProtectedCheckout()) {
  console.log('Skipping vendor — local plugins/ checkout present');
  process.exit(0);
}

mkdirSync(pluginsRoot, { recursive: true });

for (const entry of plugins) {
  const name = entry.package;
  const dirName =
    PACKAGE_TO_DIR[name] ??
    `crm-plugin-${name.replace(/^@khirby\/plugin-/, '').replace(/^@crm\/plugin-/, '')}`;
  const dest = join(pluginsRoot, dirName);
  let srcRoot;
  try {
    srcRoot = resolvePackageRoot(name);
  } catch (err) {
    throw new Error(
      `Cannot resolve ${name} — run pnpm install first (${err instanceof Error ? err.message : err})`,
    );
  }

  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const srcDir = join(srcRoot, 'src');
  if (!existsSync(srcDir)) {
    throw new Error(`${name} has no src/ at ${srcRoot}`);
  }
  cpSync(srcDir, join(dest, 'src'), { recursive: true });

  const pkg = JSON.parse(readFileSync(join(srcRoot, 'package.json'), 'utf8'));
  writeFileSync(
    join(dest, 'package.json'),
    JSON.stringify(
      {
        name: pkg.name,
        version: pkg.version,
        private: true,
        main: pkg.main ?? 'src/index.ts',
        types: pkg.types ?? 'src/index.ts',
        exports: pkg.exports,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Vendored ${name}@${pkg.version} → plugins/${dirName}`);
}

const apiNodeModules = join(root, 'apps/api/node_modules');
const pluginsNodeModules = join(pluginsRoot, 'node_modules');
if (existsSync(apiNodeModules)) {
  rmSync(pluginsNodeModules, { recursive: true, force: true });
  symlinkSync(relative(pluginsRoot, apiNodeModules), pluginsNodeModules);
}

console.log(`Vendored ${plugins.length} plugin(s)`);
