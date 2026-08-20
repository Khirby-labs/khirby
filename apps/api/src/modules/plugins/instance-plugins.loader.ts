import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createJiti } from 'jiti';
import type { CrmPlugin } from '@khirby/plugin-sdk';
import { type InstancePluginScaffoldInput, writeScaffold } from './instance-plugin-scaffold';
import { assertInstancePluginShape } from './instance-plugin-validate';

/** Sidecar inside `plugins/` — not the repo-root image manifest. */
export const INSTANCE_MANIFEST = 'instance.manifest.json';
export const MAX_INSTANCE_FILES = 24;
export const MAX_INSTANCE_FILE_BYTES = 100_000;

/** First-party checkout dirs. Scaffold/write must not land on top of these. */
export const FIRST_PARTY_PLUGIN_DIRS: readonly string[] = [
  'crm-plugin-webhook',
  'crm-plugin-discord',
  'crm-plugin-listmonk',
  'crm-plugin-mcp',
  'crm-plugin-ai-compose',
  'crm-plugin-pokelo',
];

export type InstanceManifest = {
  plugins: Array<{ package: string; local: string }>;
};

/** Walk up from `start` looking for the monorepo root (ADR-0039). */
export function findRepoRoot(start = process.cwd()): string | undefined {
  let dir = resolve(start);
  for (let i = 0; i < 10; i++) {
    if (
      existsSync(join(dir, 'plugins.manifest.json')) &&
      existsSync(join(dir, 'pnpm-workspace.yaml'))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function defaultInstancePluginsDir(start = process.cwd()): string {
  const fromEnv = process.env.INSTANCE_PLUGINS_DIR?.trim();
  if (fromEnv) return fromEnv;
  const root = findRepoRoot(start);
  if (root) return join(root, 'plugins');
  return join(start, 'plugins');
}

/** One path segment, no `..`, no absolute, no separators. */
export function isSafeLocalSegment(local: string): boolean {
  if (!local || local === '.' || local === '..') return false;
  if (local.includes('/') || local.includes('\\')) return false;
  if (isAbsolute(local)) return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(local);
}

export function packageDeclaresWeb(pkg: Record<string, unknown>): boolean {
  const exportsField = pkg.exports;
  if (!exportsField || typeof exportsField !== 'object' || Array.isArray(exportsField)) {
    return false;
  }
  return './web' in (exportsField as Record<string, unknown>);
}

function readManifest(dir: string): InstanceManifest {
  const path = join(dir, INSTANCE_MANIFEST);
  if (!existsSync(path)) return { plugins: [] };
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!raw || typeof raw !== 'object' || !Array.isArray((raw as InstanceManifest).plugins)) {
      return { plugins: [] };
    }
    return raw as InstanceManifest;
  } catch {
    return { plugins: [] };
  }
}

export function appendInstanceManifest(dir: string, packageName: string, localDir: string): void {
  if (!isSafeLocalSegment(localDir)) {
    throw new Error(`unsafe local path: ${localDir}`);
  }
  mkdirSync(dir, { recursive: true });
  const manifest = readManifest(dir);
  const existing = manifest.plugins.findIndex(
    (p) => p.local === localDir || p.package === packageName,
  );
  const entry = { package: packageName, local: localDir };
  if (existing >= 0) manifest.plugins[existing] = entry;
  else manifest.plugins.push(entry);
  writeFileSync(join(dir, INSTANCE_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export function removeInstanceManifest(dir: string, localDir: string): void {
  if (!existsSync(dir)) return;
  const manifest = readManifest(dir);
  const next = manifest.plugins.filter((p) => p.local !== localDir);
  if (next.length === manifest.plugins.length) return;
  writeFileSync(
    join(dir, INSTANCE_MANIFEST),
    `${JSON.stringify({ plugins: next }, null, 2)}\n`,
    'utf8',
  );
}

/** Volume segment for an installed plugin name, or null when not on the instance volume. */
export function findInstanceLocalDirForPlugin(
  volumeDir: string,
  pluginName: string,
): string | null {
  const manifest = readManifest(volumeDir);
  for (const entry of manifest.plugins) {
    if (entry.package === pluginName) return entry.local;
    const pkgDir = join(volumeDir, entry.local);
    if (!existsSync(join(pkgDir, 'package.json'))) continue;
    try {
      if (loadPluginFromDir(pkgDir).name === pluginName) return entry.local;
    } catch {
      // Broken tree — keep scanning.
    }
  }
  if (!existsSync(volumeDir)) return null;
  for (const local of readdirSync(volumeDir)) {
    if (!isSafeLocalSegment(local) || FIRST_PARTY_PLUGIN_DIRS.includes(local)) continue;
    const pkgDir = join(volumeDir, local);
    if (!statSync(pkgDir).isDirectory()) continue;
    if (!existsSync(join(pkgDir, 'package.json'))) continue;
    try {
      if (loadPluginFromDir(pkgDir).name === pluginName) return local;
    } catch {
      // Orphan or invalid package — skip.
    }
  }
  return null;
}

export function readPackageName(absDir: string): string {
  const pkgPath = join(absDir, 'package.json');
  if (!existsSync(pkgPath)) {
    throw new Error('package.json missing');
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
  if (typeof pkg.name !== 'string' || !pkg.name.trim()) {
    throw new Error('package.json name is required');
  }
  return pkg.name.trim();
}

function exportsDot(pkg: Record<string, unknown>): string | undefined {
  const exportsField = pkg.exports;
  if (typeof exportsField === 'string') return exportsField;
  if (!exportsField || typeof exportsField !== 'object' || Array.isArray(exportsField))
    return undefined;
  const dot = (exportsField as Record<string, unknown>)['.'];
  if (typeof dot === 'string') return dot;
  if (dot && typeof dot === 'object' && !Array.isArray(dot)) {
    const map = dot as Record<string, unknown>;
    if (typeof map.import === 'string') return map.import;
    if (typeof map.default === 'string') return map.default;
    if (typeof map.require === 'string') return map.require;
  }
  return undefined;
}

export function resolvePackageEntry(absDir: string): string {
  const pkgPath = join(absDir, 'package.json');
  if (!existsSync(pkgPath)) {
    throw new Error('package.json missing');
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
  const rel =
    exportsDot(pkg) ?? (typeof pkg.main === 'string' ? pkg.main : undefined) ?? 'src/index.ts';
  const entry = resolve(absDir, rel);
  const root = resolve(absDir) + sep;
  if (!entry.startsWith(root) && entry !== resolve(absDir)) {
    throw new Error('package entry escapes plugin directory');
  }
  return entry;
}

export function loadPluginFromDir(absDir: string): CrmPlugin {
  const pkgPath = join(absDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
  if (packageDeclaresWeb(pkg)) {
    const err = new Error('web_not_hot_loadable');
    err.name = 'web_not_hot_loadable';
    throw err;
  }
  const entry = resolvePackageEntry(absDir);
  // Nest decorators in instance-plugin entry files need reflect-metadata at jiti eval time.
  require('reflect-metadata');
  purgeInstancePluginLoadCache(absDir);
  const jiti = createJiti(pkgPath, { moduleCache: false, fsCache: false });
  const loaded = jiti(entry) as {
    createPlugin?: () => CrmPlugin;
    default?: { createPlugin?: () => CrmPlugin };
  };
  const create = loaded.createPlugin ?? loaded.default?.createPlugin;
  if (typeof create !== 'function') {
    throw new Error('createPlugin export missing');
  }
  const plugin = create();
  if (!plugin?.name) {
    throw new Error('createPlugin returned no name');
  }
  assertInstancePluginShape(plugin);
  return plugin;
}

/** Drop Node/jiti/ts-node cache for a volume plugin so the next load sees disk. */
export function purgeInstancePluginLoadCache(absDir: string): void {
  const root = resolve(absDir);
  const prefixes = [root + sep, `file://${root}${sep}`];
  for (const key of Object.keys(require.cache)) {
    if (prefixes.some((p) => key.startsWith(p)) || key === root) {
      delete require.cache[key];
    }
  }
}

/**
 * Boot-time scan. Empty / missing dir → []. `local: ".."` is skipped.
 * A name already in `imageNames` is skipped (image wins).
 */
function listedLocals(dir: string): string[] {
  const fromManifest = readManifest(dir).plugins.map((p) => p.local);
  const fromDisk: string[] = [];
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules') continue;
      const abs = join(dir, name);
      if (!statSync(abs).isDirectory()) continue;
      fromDisk.push(name);
    }
  }
  return [...new Set([...fromManifest, ...fromDisk])];
}

export function loadInstancePlugins(
  dir: string | undefined,
  imageNames: Set<string>,
  log: (msg: string) => void = () => undefined,
): CrmPlugin[] {
  if (!dir) return [];
  const absDir = resolve(dir);
  if (!existsSync(absDir)) return [];
  const out: CrmPlugin[] = [];
  for (const local of listedLocals(absDir)) {
    if (!isSafeLocalSegment(local) || FIRST_PARTY_PLUGIN_DIRS.includes(local)) {
      if (!isSafeLocalSegment(local)) {
        log(`Instance plugin local path skipped: ${local}`);
      }
      continue;
    }
    const pkgDir = join(absDir, local);
    if (!existsSync(join(pkgDir, 'package.json'))) continue;
    try {
      const plugin = loadPluginFromDir(pkgDir);
      if (imageNames.has(plugin.name)) {
        log(`Instance plugin ${plugin.name} clashes with image — image wins`);
        continue;
      }
      if (out.some((p) => p.name === plugin.name)) {
        log(`Instance plugin ${plugin.name} listed twice — skipped`);
        continue;
      }
      out.push(plugin);
    } catch (err) {
      log(`Instance plugin ${local} failed to load: ${(err as Error).message}`);
    }
  }
  return out;
}

/** Ensure `absPath` is inside `root` (after normalize). */
export function assertPathInside(root: string, absPath: string): void {
  const base = resolve(root) + sep;
  const target = resolve(absPath);
  if (target !== resolve(root) && !target.startsWith(base)) {
    throw new Error('path escapes instance plugins dir');
  }
}

export function ensureInstanceDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

/** Relative file under a plugin dir: no `..`, no absolute, safe segments. */
export function isSafeRelPath(rel: string): boolean {
  if (!rel || rel.startsWith('/') || rel.includes('\0') || rel.includes('..')) return false;
  const parts = rel.split(/[/\\]/);
  return parts.every((p) => p.length > 0 && p !== '.' && p !== '..' && /^[a-zA-Z0-9._-]+$/.test(p));
}

export function resolveInPlugin(root: string, rel: string): string {
  const abs = resolve(root, rel);
  assertPathInside(root, abs);
  return abs;
}

export function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      if (name === 'node_modules') continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else n += 1;
    }
  };
  walk(dir);
  return n;
}

export function listRelFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      if (name === 'node_modules') continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

export function pluginVolumeRoot(volumeDir: string, directory: string): string {
  if (!isSafeLocalSegment(directory)) {
    throw new Error('bad_path');
  }
  if (directory === 'node_modules' || FIRST_PARTY_PLUGIN_DIRS.includes(directory)) {
    throw new Error('reserved_dir');
  }
  return join(volumeDir, directory);
}

export function scaffoldInstancePlugin(
  volumeDir: string,
  input: InstancePluginScaffoldInput,
): { directory: string; files: string[] } {
  const root = pluginVolumeRoot(volumeDir, input.directory);
  ensureInstanceDir(root);
  const files = writeScaffold(root, input);
  return { directory: root, files };
}

export function writeInstancePluginFile(
  volumeDir: string,
  directory: string,
  relPath: string,
  content: string,
): { directory: string; path: string; bytes: number } {
  if (!isSafeRelPath(relPath)) {
    throw new Error('bad_path');
  }
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > MAX_INSTANCE_FILE_BYTES) {
    throw new Error('too_large');
  }
  const root = pluginVolumeRoot(volumeDir, directory);
  const abs = resolveInPlugin(root, relPath);
  const existed = existsSync(abs);
  if (!existed && countFiles(root) >= MAX_INSTANCE_FILES) {
    throw new Error('too_many_files');
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
  return { directory, path: relPath, bytes };
}

export function readInstancePluginFile(
  volumeDir: string,
  directory: string,
  relPath: string,
): { directory: string; path: string; content: string } {
  if (!isSafeRelPath(relPath)) {
    throw new Error('bad_path');
  }
  const root = pluginVolumeRoot(volumeDir, directory);
  const abs = resolveInPlugin(root, relPath);
  if (!existsSync(abs)) {
    throw new Error('not_found');
  }
  return { directory, path: relPath, content: readFileSync(abs, 'utf8') };
}

export function listInstancePluginFiles(
  volumeDir: string,
  directory: string,
): { directory: string; files: string[] } {
  const root = pluginVolumeRoot(volumeDir, directory);
  return { directory, files: listRelFiles(root) };
}
