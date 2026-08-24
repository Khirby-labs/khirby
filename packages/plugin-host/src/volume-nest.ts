import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

let tsNodeReady = false;

function pickNestModule(loaded: Record<string, unknown>): unknown {
  if (typeof loaded.PluginNestModule === 'function') return loaded.PluginNestModule;
  if (loaded.default && typeof loaded.default === 'object') {
    const inner = pickNestModule(loaded.default as Record<string, unknown>);
    if (inner) return inner;
  }
  for (const [key, value] of Object.entries(loaded)) {
    if (key === 'default' || typeof value !== 'function') continue;
    if (key.endsWith('NestModule') || key === 'PluginNestModule') return value;
  }
  return undefined;
}

function purgeResolved(cache: NodeJS.Require['cache'], resolved: string): void {
  for (const key of Object.keys(cache)) {
    if (key === resolved || key.startsWith(`${resolved}.`) || key.includes(`${resolved}?`)) {
      delete cache[key];
    }
  }
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
  const pkgJson = existsSync(join(srcDir, 'package.json'))
    ? join(srcDir, 'package.json')
    : join(srcDir, '..', 'package.json');
  const nativeRequire = createRequire(pkgJson);
  nativeRequire('reflect-metadata');
  if (!tsNodeReady) {
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
  const nestFile = existsSync(join(srcDir, 'nest-module.ts'))
    ? join(srcDir, 'nest-module.ts')
    : join(srcDir, 'src', 'nest-module.ts');
  if (!existsSync(nestFile)) {
    throw new Error('src/nest-module.ts missing');
  }
  const resolved = nativeRequire.resolve(nestFile);
  purgeResolved(nativeRequire.cache, resolved);
  const loaded = nativeRequire(resolved) as Record<string, unknown>;
  const nest = pickNestModule(loaded);
  if (!nest) {
    throw new Error('src/nest-module.ts must export PluginNestModule (or a *NestModule class)');
  }
  return nest;
}
