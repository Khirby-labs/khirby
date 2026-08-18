import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { createJiti } from 'jiti';
import type { CrmPlugin } from '@khirby/plugin-sdk';

export const INSTANCE_MANIFEST = 'plugins.manifest.json';
export const MAX_INSTANCE_FILES = 24;
export const MAX_INSTANCE_FILE_BYTES = 100_000;

export type InstanceManifest = {
  plugins: Array<{ package: string; local: string }>;
};

export function defaultInstancePluginsDir(): string {
  const fromEnv = process.env.INSTANCE_PLUGINS_DIR?.trim();
  if (fromEnv) return fromEnv;
  return join(process.cwd(), 'instance-plugins');
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
  const jiti = createJiti(pkgPath);
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
  return plugin;
}

/**
 * Boot-time scan. Empty / missing dir → []. `local: ".."` is skipped.
 * A name already in `imageNames` is skipped (image wins).
 */
export function loadInstancePlugins(
  dir: string | undefined,
  imageNames: Set<string>,
  log: (msg: string) => void = () => undefined,
): CrmPlugin[] {
  if (!dir) return [];
  const absDir = resolve(dir);
  if (!existsSync(absDir)) return [];
  const manifest = readManifest(absDir);
  const out: CrmPlugin[] = [];
  for (const entry of manifest.plugins) {
    if (!isSafeLocalSegment(entry.local)) {
      log(`Instance plugin local path skipped: ${entry.local}`);
      continue;
    }
    const pkgDir = join(absDir, entry.local);
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
      log(`Instance plugin ${entry.package} failed to load: ${(err as Error).message}`);
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
