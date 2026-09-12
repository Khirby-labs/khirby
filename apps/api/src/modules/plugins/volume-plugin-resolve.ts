import { existsSync } from 'node:fs';
import Module from 'node:module';
import { delimiter, dirname, join } from 'node:path';

/**
 * First-party Marketplace tarballs still import the host via the monorepo
 * relative path used to compile plugins into `apps/api/dist`:
 * `../../../packages/plugin-host/src`. After unpack that points at
 * `/app/packages/plugin-host/src` — and the runner image used to ship only
 * `package.json` there. Bare `@khirby/plugin-*` from `/app/plugins/...` also
 * misses `apps/api/node_modules` (pnpm isolation).
 *
 * Map both forms onto the host sources (dev) or the tsc emit next to this
 * file (image), and put `apps/api/node_modules` on NODE_PATH for Nest/drizzle.
 */

type HostPkg = 'plugin-host' | 'plugin-sdk';

const RELATIVE_HOST = /^(?:\.\.\/)+packages\/plugin-(host|sdk)(?:\/src)?(\/.*)?$/;
const BARE_HOST = /^@khirby\/plugin-(host|sdk)(\/.*)?$/;

type ResolveFilename = (
  request: string,
  parent: NodeModule | undefined,
  isMain: boolean,
  options?: { paths?: string[] },
) => string;

type NodeModuleInternals = {
  _resolveFilename: ResolveFilename;
  _initPaths: () => void;
};

const nodeModule = Module as unknown as NodeModuleInternals;

let hooked = false;

/** Absolute `packages/<pkg>/src` — works from `apps/api/src/...` and from `dist/...`. */
export function hostPackageSrc(pkg: HostPkg): string {
  const candidate = join(__dirname, '..', '..', '..', '..', '..', 'packages', pkg, 'src');
  if (existsSync(candidate)) return candidate;
  throw new Error(`Khirby host package ${pkg} is not available at ${candidate}`);
}

export function rewriteVolumePluginSpecifier(request: string): string | null {
  if (!request || request.startsWith('/') || request.startsWith('node:')) return null;

  let pkg: HostPkg | null = null;
  let rest = '';

  const relative = request.match(RELATIVE_HOST);
  if (relative) {
    pkg = relative[1] === 'host' ? 'plugin-host' : 'plugin-sdk';
    rest = relative[2] ?? '';
  } else {
    const bare = request.match(BARE_HOST);
    if (!bare) return null;
    pkg = bare[1] === 'host' ? 'plugin-host' : 'plugin-sdk';
    rest = bare[2] ?? '';
  }

  const root = hostPackageSrc(pkg);
  const sub = rest.replace(/^\//, '').replace(/\.(tsx?|mts|cts|jsx?)$/, '');
  const base = !sub || sub === 'index' ? join(root, 'index') : join(root, sub);
  return firstExisting(base, root);
}

/** Prefix map for jiti (it resolves specifiers itself, not via `Module._resolveFilename`). */
export function hostJitiAlias(): Record<string, string> {
  const host = hostPackageSrc('plugin-host');
  const sdk = hostPackageSrc('plugin-sdk');
  const alias: Record<string, string> = {
    '@khirby/plugin-host': host,
    '@khirby/plugin-sdk': sdk,
  };
  for (let depth = 1; depth <= 8; depth++) {
    const rel = `${'../'.repeat(depth)}packages/plugin-`;
    alias[`${rel}host/src`] = host;
    alias[`${rel}sdk/src`] = sdk;
  }
  return alias;
}

function firstExisting(base: string, fallback: string): string {
  for (const candidate of [
    base,
    `${base}.js`,
    `${base}.ts`,
    join(base, 'index.js'),
    join(base, 'index.ts'),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return existsSync(fallback) ? fallback : base;
}

export function findApiNodeModules(start = __dirname): string | null {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'node_modules', '@nestjs', 'common'))) {
      return join(dir, 'node_modules');
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Idempotent. Safe to call from every `loadPluginFromDir`. */
export function ensureVolumePluginModuleResolution(): void {
  const apiNm = findApiNodeModules();
  if (apiNm) {
    const parts = (process.env.NODE_PATH ?? '').split(delimiter).filter(Boolean);
    if (!parts.includes(apiNm)) {
      process.env.NODE_PATH = [apiNm, ...parts].join(delimiter);
      nodeModule._initPaths();
    }
  }

  if (hooked) return;
  hooked = true;
  const orig = nodeModule._resolveFilename;
  nodeModule._resolveFilename = function (request, parent, isMain, options) {
    const rewritten = rewriteVolumePluginSpecifier(request);
    return orig.call(this, rewritten ?? request, parent, isMain, options);
  };
}
