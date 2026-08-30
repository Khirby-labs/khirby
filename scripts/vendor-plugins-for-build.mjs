#!/usr/bin/env node
/**
 * Copy npm plugin sources into plugins/ for Nest compile (ADR-0037).
 *
 * Default is hybrid: keep any plugins/<dir> that already has src/, vendor only
 * the gaps from node_modules. KHIRBY_PLUGINS_WORKSPACE=1 or plugins/.git means
 * local-only — never copy from npm (a missing package is a checkout problem).
 */
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

function isLocalOnlyMode() {
  return process.env.KHIRBY_PLUGINS_WORKSPACE === '1' || existsSync(join(pluginsRoot, '.git'));
}

function hasLocalSources(dest) {
  return existsSync(join(dest, 'src')) && existsSync(join(dest, 'package.json'));
}

function pluginDirName(packageName) {
  return (
    PACKAGE_TO_DIR[packageName] ??
    `crm-plugin-${packageName.replace(/^@khirby\/plugin-/, '').replace(/^@crm\/plugin-/, '')}`
  );
}

function vendorInto(dest, srcRoot, name) {
  const srcDir = join(srcRoot, 'src');
  if (!existsSync(srcDir)) {
    throw new Error(`${name} has no src/ at ${srcRoot}`);
  }
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
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
  console.log(`Vendored ${name}@${pkg.version} → plugins/${pluginDirName(name)}`);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const plugins = manifest.plugins;
if (!Array.isArray(plugins)) {
  console.error('Invalid plugins.manifest.json');
  process.exit(1);
}

if (isLocalOnlyMode()) {
  console.log('Skipping vendor — local-only (KHIRBY_PLUGINS_WORKSPACE or plugins/.git)');
  process.exit(0);
}

mkdirSync(pluginsRoot, { recursive: true });

let vendored = 0;
let kept = 0;

for (const entry of plugins) {
  const name = entry.package;
  /*
   * A `local` entry already sits in the source tree (examples/*) and is compiled
   * from there, so there is nothing to vendor. Copying it into plugins/ would
   * produce a second copy of the same sources and — via the fallback naming below
   * — a directory whose prefix is doubled.
   */
  if (typeof entry.local === 'string' && entry.local) {
    console.log(`Skipping vendor for ${name} — local source at ${entry.local}`);
    continue;
  }
  const dirName = pluginDirName(name);
  const dest = join(pluginsRoot, dirName);
  let srcRoot;
  try {
    srcRoot = resolvePackageRoot(name);
  } catch (err) {
    throw new Error(
      `Cannot resolve ${name} — run pnpm install first (${err instanceof Error ? err.message : err})`,
    );
  }

  if (hasLocalSources(dest)) {
    const localVer = JSON.parse(readFileSync(join(dest, 'package.json'), 'utf8')).version;
    const npmVer = JSON.parse(readFileSync(join(srcRoot, 'package.json'), 'utf8')).version;
    const stale =
      localVer !== npmVer
        ? ` (on disk ${localVer}, npm ${npmVer} — delete plugins/${dirName} to refresh)`
        : '';
    console.log(`Keeping plugins/${dirName}${stale}`);
    kept += 1;
    continue;
  }

  vendorInto(dest, srcRoot, name);
  vendored += 1;
}

const apiNodeModules = join(root, 'apps/api/node_modules');
const pluginsNodeModules = join(pluginsRoot, 'node_modules');
if (existsSync(apiNodeModules)) {
  rmSync(pluginsNodeModules, { recursive: true, force: true });
  symlinkSync(relative(pluginsRoot, apiNodeModules), pluginsNodeModules);
}

console.log(
  `Vendor hybrid: kept ${kept}, vendored ${vendored} of ${plugins.length} manifest plugin(s)`,
);
