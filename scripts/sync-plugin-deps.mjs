#!/usr/bin/env node
/** Sync plugin deps in apps/api (+ apps/web when entry.web) from plugins.manifest.json. */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const manifestPath = join(root, 'plugins.manifest.json');
const apiPkgPath = join(root, 'apps/api/package.json');
const webPkgPath = join(root, 'apps/web/package.json');
const managedPath = join(root, 'apps/api/plugin-deps.generated.json');
const webManagedPath = join(root, 'apps/web/plugin-deps.generated.json');

const HOST_PACKAGES = new Set(['@khirby/plugin-sdk', '@khirby/plugin-host']);

const WORKSPACE_DIRS = {
  '@khirby/plugin-webhook': 'crm-plugin-webhook',
  '@khirby/plugin-discord': 'crm-plugin-discord',
  '@khirby/plugin-listmonk': 'crm-plugin-listmonk',
  '@khirby/plugin-mcp': 'crm-plugin-mcp',
  '@khirby/plugin-ai-compose': 'crm-plugin-ai-compose',
  '@khirby/plugin-pokelo': 'crm-plugin-pokelo',
};

function workspacePluginDir(packageName) {
  const mapped = WORKSPACE_DIRS[packageName];
  if (mapped) {
    const dir = join(root, 'plugins', mapped);
    if (existsSync(join(dir, 'package.json'))) return dir;
  }
  return null;
}

function resolveDepRange(entry) {
  const name = entry.package;
  if (!name || typeof name !== 'string') {
    throw new Error(`Invalid manifest entry: ${JSON.stringify(entry)}`);
  }
  if (process.env.KHIRBY_PLUGINS_WORKSPACE === '1' && workspacePluginDir(name)) {
    return 'workspace:*';
  }
  if (entry.version && typeof entry.version === 'string') {
    return entry.version;
  }
  throw new Error(`plugins.manifest.json: ${name} needs a "version" range`);
}

function sortKeys(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

function syncPkgDeps(pkgPath, managedFile, wanted) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.dependencies = pkg.dependencies ?? {};

  let previouslyManaged = [];
  if (existsSync(managedFile)) {
    previouslyManaged = JSON.parse(readFileSync(managedFile, 'utf8'));
    if (!Array.isArray(previouslyManaged)) previouslyManaged = [];
  }

  for (const name of previouslyManaged) {
    if (!wanted.has(name) && pkg.dependencies[name]) {
      delete pkg.dependencies[name];
      console.log(`Removed plugin dep from ${pkg.name}: ${name}`);
    }
  }

  for (const [name, range] of wanted) {
    const prev = pkg.dependencies[name];
    if (prev !== range) {
      pkg.dependencies[name] = range;
      console.log(`${prev ? 'Updated' : 'Added'} plugin dep (${pkg.name}): ${name}@${range}`);
    }
  }

  pkg.dependencies = sortKeys(pkg.dependencies);
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  writeFileSync(managedFile, JSON.stringify([...wanted.keys()], null, 2) + '\n');
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const plugins = manifest.plugins;
if (!Array.isArray(plugins)) {
  console.error('Invalid plugins.manifest.json — expected { plugins: [] }');
  process.exit(1);
}

const apiWanted = new Map();
const webWanted = new Map();
for (const entry of plugins) {
  const name = entry.package;
  if (HOST_PACKAGES.has(name)) {
    console.error(`Refusing to manage host package via manifest: ${name}`);
    process.exit(1);
  }
  const range = resolveDepRange(entry);
  apiWanted.set(name, range);
  if (entry.web === true) {
    webWanted.set(name, range);
  }
}

syncPkgDeps(apiPkgPath, managedPath, apiWanted);
if (existsSync(webPkgPath)) {
  syncPkgDeps(webPkgPath, webManagedPath, webWanted);
}
console.log(`Synced ${apiWanted.size} api + ${webWanted.size} web plugin dep(s)`);
