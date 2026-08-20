import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import 'reflect-metadata';
import { register as registerTsNode } from 'ts-node';
import {
  appendInstanceManifest,
  defaultInstancePluginsDir,
  findRepoRoot,
  INSTANCE_MANIFEST,
  isSafeLocalSegment,
  isSafeRelPath,
  findInstanceLocalDirForPlugin,
  listInstancePluginFiles,
  loadInstancePlugins,
  loadPluginFromDir,
  packageDeclaresWeb,
  pluginVolumeRoot,
  readInstancePluginFile,
  scaffoldInstancePlugin,
  writeInstancePluginFile,
} from './instance-plugins.loader';
import { scaffoldFileMap } from './instance-plugin-scaffold';

function writePlugin(dir: string, opts: { name: string; web?: boolean; skipCreate?: boolean }) {
  mkdirSync(join(dir, 'src'), { recursive: true });
  const exportsField: Record<string, string> = { '.': './src/index.ts' };
  if (opts.web) exportsField['./web'] = './src/web/index.ts';
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name: `pkg-${opts.name}`,
      version: '0.1.0',
      main: './src/index.ts',
      exports: exportsField,
    }),
  );
  if (opts.skipCreate) {
    writeFileSync(join(dir, 'src/index.ts'), 'export const nope = 1;\n');
    return;
  }
  writeFileSync(
    join(dir, 'src/index.ts'),
    `export function createPlugin() {
  return { name: '${opts.name}', displayName: '${opts.name}', version: '0.1.0' };
}
`,
  );
}

describe('instance-plugins.loader', () => {
  it('isSafeLocalSegment rejects traversal and nested paths', () => {
    expect(isSafeLocalSegment('my-plugin')).toBe(true);
    expect(isSafeLocalSegment('..')).toBe(false);
    expect(isSafeLocalSegment('../x')).toBe(false);
    expect(isSafeLocalSegment('a/b')).toBe(false);
    expect(isSafeLocalSegment('')).toBe(false);
  });

  it('loadInstancePlugins returns [] for a missing or empty dir', () => {
    const missing = join(tmpdir(), `no-such-instance-plugins-${Date.now()}`);
    expect(loadInstancePlugins(missing, new Set())).toEqual([]);
    const empty = mkdtempSync(join(tmpdir(), 'instance-empty-'));
    expect(loadInstancePlugins(empty, new Set())).toEqual([]);
  });

  it('skips local: ".." and logs', () => {
    const root = mkdtempSync(join(tmpdir(), 'instance-dotdot-'));
    appendInstanceManifest(root, 'evil', 'ok-name');
    writeFileSync(
      join(root, INSTANCE_MANIFEST),
      JSON.stringify({ plugins: [{ package: 'evil', local: '..' }] }),
    );
    const logs: string[] = [];
    expect(loadInstancePlugins(root, new Set(), (m) => logs.push(m))).toEqual([]);
    expect(logs.some((l) => l.includes('skipped'))).toBe(true);
  });

  it('loads a package from the volume', () => {
    const root = mkdtempSync(join(tmpdir(), 'instance-ok-'));
    const local = 'demo-plugin';
    writePlugin(join(root, local), { name: 'crm_demo' });
    appendInstanceManifest(root, 'demo-plugin', local);
    const loaded = loadInstancePlugins(root, new Set());
    expect(loaded.map((p) => p.name)).toEqual(['crm_demo']);
  });

  it('image name wins over a clashing instance plugin', () => {
    const root = mkdtempSync(join(tmpdir(), 'instance-clash-'));
    const local = 'mcp-clone';
    writePlugin(join(root, local), { name: 'crm_mcp' });
    appendInstanceManifest(root, 'mcp-clone', local);
    const logs: string[] = [];
    const loaded = loadInstancePlugins(root, new Set(['crm_mcp']), (m) => logs.push(m));
    expect(loaded).toEqual([]);
    expect(logs.some((l) => l.includes('clashes'))).toBe(true);
  });

  it('loadPluginFromDir rejects exports["./web"]', () => {
    const dir = mkdtempSync(join(tmpdir(), 'instance-web-'));
    writePlugin(dir, { name: 'crm_webby', web: true });
    expect(() => loadPluginFromDir(dir)).toThrow('web_not_hot_loadable');
  });

  it('loadPluginFromDir rejects a package without createPlugin', () => {
    const dir = mkdtempSync(join(tmpdir(), 'instance-nocreate-'));
    writePlugin(dir, { name: 'crm_empty', skipCreate: true });
    expect(() => loadPluginFromDir(dir)).toThrow(/createPlugin/);
  });

  it('packageDeclaresWeb reads exports["./web"]', () => {
    expect(
      packageDeclaresWeb({ exports: { '.': './src/index.ts', './web': './src/web.ts' } }),
    ).toBe(true);
    expect(packageDeclaresWeb({ exports: { '.': './src/index.ts' } })).toBe(false);
  });

  it('findRepoRoot / defaultInstancePluginsDir resolve to <repo>/plugins', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-root-'));
    writeFileSync(join(root, 'plugins.manifest.json'), '{"plugins":[]}');
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    const nested = join(root, 'apps', 'api');
    mkdirSync(nested, { recursive: true });
    expect(findRepoRoot(nested)).toBe(root);
    const prev = process.env.INSTANCE_PLUGINS_DIR;
    delete process.env.INSTANCE_PLUGINS_DIR;
    try {
      expect(defaultInstancePluginsDir(nested)).toBe(join(root, 'plugins'));
    } finally {
      if (prev === undefined) delete process.env.INSTANCE_PLUGINS_DIR;
      else process.env.INSTANCE_PLUGINS_DIR = prev;
    }
  });

  it('loads a package that is only on disk (no sidecar manifest)', () => {
    const root = mkdtempSync(join(tmpdir(), 'instance-scan-'));
    writePlugin(join(root, 'crm-plugin-demo'), { name: 'crm_demo' });
    expect(loadInstancePlugins(root, new Set()).map((p) => p.name)).toEqual(['crm_demo']);
  });

  it('does not load a first-party directory even if it has createPlugin', () => {
    const root = mkdtempSync(join(tmpdir(), 'instance-first-party-'));
    writePlugin(join(root, 'crm-plugin-mcp'), { name: 'crm_from_disk' });
    expect(loadInstancePlugins(root, new Set())).toEqual([]);
  });

  it('pluginVolumeRoot rejects first-party dirs', () => {
    expect(() => pluginVolumeRoot('/tmp', 'crm-plugin-mcp')).toThrow('reserved_dir');
  });

  it('isSafeRelPath rejects traversal', () => {
    expect(isSafeRelPath('src/index.ts')).toBe(true);
    expect(isSafeRelPath('../x.ts')).toBe(false);
    expect(isSafeRelPath('/abs.ts')).toBe(false);
  });

  it('write/read/list round-trip a file and reject traversal', () => {
    const root = mkdtempSync(join(tmpdir(), 'instance-files-'));
    expect(() => writeInstancePluginFile(root, 'ok', '../x.ts', 'nope')).toThrow('bad_path');
    const written = writeInstancePluginFile(
      root,
      'my-demo',
      'src/index.ts',
      'export const x = 1\n',
    );
    expect(written.bytes).toBeGreaterThan(0);
    expect(listInstancePluginFiles(root, 'my-demo').files).toEqual(['src/index.ts']);
    expect(readInstancePluginFile(root, 'my-demo', 'src/index.ts').content).toBe(
      'export const x = 1\n',
    );
  });

  it('loads nest module when getNestModule is called', () => {
    const root = mkdtempSync(join(tmpdir(), 'instance-nest-module-'));
    const repoRoot = findRepoRoot(join(__dirname, '..'));
    if (repoRoot) {
      symlinkSync(join(repoRoot, 'apps/api/node_modules'), join(root, 'node_modules'));
    }
    scaffoldInstancePlugin(root, {
      directory: 'crm-plugin-nest-mod',
      name: 'crm_nest_mod',
      displayName: 'Nest Mod',
      nest: true,
    });
    const plugin = loadPluginFromDir(join(root, 'crm-plugin-nest-mod'));
    registerTsNode({
      transpileOnly: true,
      compilerOptions: {
        module: 'commonjs',
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        esModuleInterop: true,
      },
    });
    expect(plugin.getNestModule?.()).toBeDefined();
  });

  it('loads a nest scaffold when node_modules is linked', () => {
    const root = mkdtempSync(join(tmpdir(), 'instance-nest-load-'));
    const repoRoot = findRepoRoot(join(__dirname, '..'));
    if (repoRoot) {
      symlinkSync(join(repoRoot, 'apps/api/node_modules'), join(root, 'node_modules'));
    }
    scaffoldInstancePlugin(root, {
      directory: 'crm-plugin-nest',
      name: 'crm_nest_load',
      displayName: 'Nest Load',
      nest: true,
    });
    const plugin = loadPluginFromDir(join(root, 'crm-plugin-nest'));
    expect(plugin.name).toBe('crm_nest_load');
    expect(plugin.getFrontendRoutes?.()[0].navLabel).toBe('Nest Load');
  });

  it('scaffoldInstancePlugin writes createPlugin and bare host imports', () => {
    const root = mkdtempSync(join(tmpdir(), 'instance-scaffold-'));
    const result = scaffoldInstancePlugin(root, {
      directory: 'my-demo',
      name: 'crm_demo',
      nest: true,
    });
    expect(result.files).toEqual(
      expect.arrayContaining(['package.json', 'src/index.ts', 'src/nest-module.ts']),
    );
    const src = readFileSync(join(result.directory, 'src/index.ts'), 'utf8');
    expect(src).toContain('export function createPlugin');
    expect(src).not.toContain('@khirby/plugin-host');
    expect(src).toContain('createRequire');
    const nestSrc = readFileSync(join(result.directory, 'src/nest-module.ts'), 'utf8');
    expect(nestSrc).toContain("from '@khirby/plugin-host'");
    expect(scaffoldFileMap({ directory: 'x', name: 'crm_x' })['package.json']).toContain(
      '@khirby/plugin-sdk',
    );
  });

  it('findInstanceLocalDirForPlugin resolves manifest and disk entries', () => {
    const root = mkdtempSync(join(tmpdir(), 'instance-find-'));
    const local = 'hello-world';
    writePlugin(join(root, local), { name: 'crm_hello_world' });
    appendInstanceManifest(root, 'pkg-hello', local);
    expect(findInstanceLocalDirForPlugin(root, 'crm_hello_world')).toBe(local);
    expect(findInstanceLocalDirForPlugin(root, 'crm_missing')).toBeNull();
  });
});
