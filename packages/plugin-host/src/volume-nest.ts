import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

let tsNodeReady = false;

function pickNestModule(loaded: Record<string, unknown>): unknown {
  if (typeof loaded.PluginNestModule === 'function') return loaded.PluginNestModule;
  if (loaded.default && typeof loaded.default === 'object') {
    const inner = pickNestModule(loaded.default as Record<string, unknown>);
    if (inner) return inner;
  }
  let fallback: unknown;
  for (const [key, value] of Object.entries(loaded)) {
    if (key === 'default' || typeof value !== 'function') continue;
    if (key.endsWith('NestModule') || key === 'PluginNestModule') return value;
    // Marketplace packages often export AiComposeModule / McpModule (not *NestModule).
    if (key.endsWith('Module') && !fallback) fallback = value;
  }
  return fallback;
}

function purgeResolved(cache: NodeJS.Require['cache'], resolved: string): void {
  for (const key of Object.keys(cache)) {
    if (key === resolved || key.startsWith(`${resolved}.`) || key.includes(`${resolved}?`)) {
      delete cache[key];
    }
  }
}

function ensureTsNode(nativeRequire: NodeJS.Require): void {
  nativeRequire('reflect-metadata');
  if (tsNodeReady) return;
  const tsNode = nativeRequire('ts-node') as {
    register: (opts: Record<string, unknown>) => void;
  };
  tsNode.register({
    transpileOnly: true,
    compilerOptions: {
      module: 'commonjs',
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      esModuleInterop: true,
    },
  });
  tsNodeReady = true;
}

/**
 * Prefer `nest-module.ts`, else a single `*.module.ts` under `src/` (npm plugins).
 */
export function resolveVolumeNestModuleFile(absPackageDir: string): string | null {
  const exact = [
    join(absPackageDir, 'src', 'nest-module.ts'),
    join(absPackageDir, 'nest-module.ts'),
  ];
  for (const c of exact) {
    if (existsSync(c)) return c;
  }
  const src = join(absPackageDir, 'src');
  if (!existsSync(src)) return null;
  const modules = readdirSync(src).filter((f) => f.endsWith('.module.ts') && !f.includes('.spec.'));
  if (modules.length === 1) return join(src, modules[0]);
  return null;
}

/** Load a Nest `@Module` class from an absolute `.ts` path via ts-node. */
export function loadVolumeNestModuleFile(nestFile: string): unknown {
  const pkgJson = existsSync(join(nestFile, '..', 'package.json'))
    ? join(nestFile, '..', 'package.json')
    : join(nestFile, '..', '..', 'package.json');
  const nativeRequire = createRequire(pkgJson);
  ensureTsNode(nativeRequire);
  const resolved = nativeRequire.resolve(nestFile);
  purgeResolved(nativeRequire.cache, resolved);
  const loaded = nativeRequire(resolved) as Record<string, unknown>;
  const nest = pickNestModule(loaded);
  if (!nest) {
    throw new Error(`${nestFile} must export PluginNestModule (or a *Module / *NestModule class)`);
  }
  return nest;
}

/**
 * Load `src/nest-module.ts` for an instance-volume plugin.
 *
 * Volume packages are not compiled by `tsc` (ADR-0036). Nest method decorators
 * fail under jiti, so this helper uses ts-node — plugin authors keep ESM files
 * and do not write `require()` / `ts-node.register` themselves.
 *
 * Import from `@khirby/plugin-host/volume-nest` (not the package root) so the
 * plugin entry file does not pull Nest guards into jiti.
 *
 * Published npm plugins should `import { PluginNestModule } from './nest-module'`
 * and return that class from `getNestModule()` instead.
 *
 * @param srcDir `__dirname` of `src/index.ts`
 */
export function loadVolumeNestModule(srcDir: string): unknown {
  const pkgDir = existsSync(join(srcDir, 'package.json')) ? srcDir : join(srcDir, '..');
  const nestFile = resolveVolumeNestModuleFile(pkgDir);
  if (!nestFile) {
    throw new Error('src/nest-module.ts missing');
  }
  return loadVolumeNestModuleFile(nestFile);
}
