import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import 'reflect-metadata';
import {
  appendInstanceManifest,
  defaultInstancePluginsDir,
  findRepoRoot,
  INSTANCE_MANIFEST,
  isSafeLocalSegment,
  isSafeRelPath,
  findInstanceLocalDirForPlugin,
  findMarketplaceLocalDirForPlugin,
  listInstancePluginFiles,
  loadInstancePlugins,
  loadPluginFromDir,
  packageDeclaresWeb,
  preferLocalCheckoutPlugins,
  applyRootEnvFile,
  hasWebEntryBundle,
  pluginVolumeRoot,
  readInstancePluginFile,
  resolveInstancePluginDirectory,
  scaffoldInstancePlugin,
  writeInstancePluginFile,
} from './instance-plugins.loader';
import { pluginClassName, scaffoldFileMap } from './instance-plugin-scaffold';

function writePlugin(
  dir: string,
  opts: { name: string; web?: boolean; webBundle?: boolean; skipCreate?: boolean },
) {
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
  if (opts.webBundle) {
    mkdirSync(join(dir, 'dist', 'web'), { recursive: true });
    writeFileSync(
      join(dir, 'dist', 'web', 'entry.js'),
      'export const webEntry = { name: "x", component: () => Promise.resolve({}) };\n',
    );
  }
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

  it('loadPluginFromDir rejects exports["./web"] without dist/web/entry.js', () => {
    const dir = mkdtempSync(join(tmpdir(), 'instance-web-'));
    writePlugin(dir, { name: 'crm_webby', web: true });
    expect(() => loadPluginFromDir(dir)).toThrow('web_bundle_required');
  });

  it('loadPluginFromDir accepts exports["./web"] when dist/web/entry.js exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'instance-web-ok-'));
    writePlugin(dir, { name: 'crm_web_ok', web: true, webBundle: true });
    expect(hasWebEntryBundle(dir)).toBe(true);
    expect(loadPluginFromDir(dir).name).toBe('crm_web_ok');
  });

  it('loadPluginFromDir allows packages without ./web even without a web bundle', () => {
    const dir = mkdtempSync(join(tmpdir(), 'instance-no-web-'));
    writePlugin(dir, { name: 'crm_api_only' });
    expect(hasWebEntryBundle(dir)).toBe(false);
    expect(loadPluginFromDir(dir).name).toBe('crm_api_only');
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
    const prev = process.env.KHIRBY_PLUGINS_LOCAL;
    delete process.env.KHIRBY_PLUGINS_LOCAL;
    try {
      expect(loadInstancePlugins(root, new Set())).toEqual([]);
    } finally {
      if (prev === undefined) delete process.env.KHIRBY_PLUGINS_LOCAL;
      else process.env.KHIRBY_PLUGINS_LOCAL = prev;
    }
  });

  it('preferLocalCheckoutPlugins reads 1/true/yes', () => {
    expect(preferLocalCheckoutPlugins({ KHIRBY_PLUGINS_LOCAL: '1' })).toBe(true);
    expect(preferLocalCheckoutPlugins({ KHIRBY_PLUGINS_LOCAL: 'true' })).toBe(true);
    expect(preferLocalCheckoutPlugins({ KHIRBY_PLUGINS_LOCAL: 'yes' })).toBe(true);
    expect(preferLocalCheckoutPlugins({ KHIRBY_PLUGINS_LOCAL: '0' })).toBe(false);
    expect(preferLocalCheckoutPlugins({})).toBe(false);
  });

  it('loads a first-party checkout when KHIRBY_PLUGINS_LOCAL is on', () => {
    const root = mkdtempSync(join(tmpdir(), 'instance-local-flag-'));
    writePlugin(join(root, 'crm-plugin-mcp'), { name: 'crm_from_checkout' });
    const prev = process.env.KHIRBY_PLUGINS_LOCAL;
    process.env.KHIRBY_PLUGINS_LOCAL = '1';
    try {
      expect(loadInstancePlugins(root, new Set()).map((p) => p.name)).toEqual([
        'crm_from_checkout',
      ]);
    } finally {
      if (prev === undefined) delete process.env.KHIRBY_PLUGINS_LOCAL;
      else process.env.KHIRBY_PLUGINS_LOCAL = prev;
    }
  });

  it('prefers a first-party checkout over a marketplace unpack of the same name', () => {
    const root = mkdtempSync(join(tmpdir(), 'instance-local-wins-'));
    writePlugin(join(root, 'crm-plugin-pokelo'), { name: 'crm_pokelo' });
    writePlugin(join(root, 'khirby__plugin-pokelo'), { name: 'crm_pokelo' });
    appendInstanceManifest(root, '@khirby/plugin-pokelo', 'khirby__plugin-pokelo');
    const logs: string[] = [];
    const prev = process.env.KHIRBY_PLUGINS_LOCAL;
    process.env.KHIRBY_PLUGINS_LOCAL = '1';
    try {
      const loaded = loadInstancePlugins(root, new Set(), (m) => logs.push(m));
      expect(loaded).toHaveLength(1);
      expect(loaded[0].name).toBe('crm_pokelo');
      expect(logs.some((l) => l.includes('local checkout wins'))).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.KHIRBY_PLUGINS_LOCAL;
      else process.env.KHIRBY_PLUGINS_LOCAL = prev;
    }
  });

  it('still loads a marketplace unpack with no matching checkout when the flag is on', () => {
    const root = mkdtempSync(join(tmpdir(), 'instance-local-other-'));
    writePlugin(join(root, 'khirby__plugin-discord'), { name: 'crm_discord' });
    appendInstanceManifest(root, '@khirby/plugin-discord', 'khirby__plugin-discord');
    const prev = process.env.KHIRBY_PLUGINS_LOCAL;
    process.env.KHIRBY_PLUGINS_LOCAL = '1';
    try {
      expect(loadInstancePlugins(root, new Set()).map((p) => p.name)).toEqual(['crm_discord']);
    } finally {
      if (prev === undefined) delete process.env.KHIRBY_PLUGINS_LOCAL;
      else process.env.KHIRBY_PLUGINS_LOCAL = prev;
    }
  });

  it('findInstanceLocalDirForPlugin prefers the checkout when KHIRBY_PLUGINS_LOCAL is on', () => {
    const root = mkdtempSync(join(tmpdir(), 'instance-find-prefer-'));
    writePlugin(join(root, 'crm-plugin-pokelo'), { name: 'crm_pokelo' });
    writePlugin(join(root, 'khirby__plugin-pokelo'), { name: 'crm_pokelo' });
    appendInstanceManifest(root, '@khirby/plugin-pokelo', 'khirby__plugin-pokelo');
    const prev = process.env.KHIRBY_PLUGINS_LOCAL;
    process.env.KHIRBY_PLUGINS_LOCAL = '1';
    try {
      expect(findInstanceLocalDirForPlugin(root, 'crm_pokelo')).toBe('crm-plugin-pokelo');
    } finally {
      if (prev === undefined) delete process.env.KHIRBY_PLUGINS_LOCAL;
      else process.env.KHIRBY_PLUGINS_LOCAL = prev;
    }
  });

  it('findMarketplaceLocalDirForPlugin stays on the unpack even when the flag is on', () => {
    const root = mkdtempSync(join(tmpdir(), 'instance-find-market-'));
    writePlugin(join(root, 'crm-plugin-pokelo'), { name: 'crm_pokelo' });
    writePlugin(join(root, 'khirby__plugin-pokelo'), { name: 'crm_pokelo' });
    appendInstanceManifest(root, '@khirby/plugin-pokelo', 'khirby__plugin-pokelo');
    const prev = process.env.KHIRBY_PLUGINS_LOCAL;
    process.env.KHIRBY_PLUGINS_LOCAL = '1';
    try {
      expect(findMarketplaceLocalDirForPlugin(root, 'crm_pokelo')).toBe('khirby__plugin-pokelo');
    } finally {
      if (prev === undefined) delete process.env.KHIRBY_PLUGINS_LOCAL;
      else process.env.KHIRBY_PLUGINS_LOCAL = prev;
    }
  });

  it('pluginVolumeRoot allows first-party dirs when KHIRBY_PLUGINS_LOCAL is on', () => {
    const prev = process.env.KHIRBY_PLUGINS_LOCAL;
    process.env.KHIRBY_PLUGINS_LOCAL = '1';
    try {
      expect(pluginVolumeRoot('/tmp', 'crm-plugin-mcp')).toBe(join('/tmp', 'crm-plugin-mcp'));
    } finally {
      if (prev === undefined) delete process.env.KHIRBY_PLUGINS_LOCAL;
      else process.env.KHIRBY_PLUGINS_LOCAL = prev;
    }
  });

  it('applyRootEnvFile fills missing keys and does not override set values, including empty', () => {
    const root = mkdtempSync(join(tmpdir(), 'instance-dotenv-'));
    writeFileSync(join(root, 'plugins.manifest.json'), '{"plugins":[]}');
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    writeFileSync(
      join(root, '.env'),
      'KHIRBY_PLUGINS_LOCAL=1\nOTHER_FLAG=from-file\nCONTROL_PLANE_URL=https://ctrl.bearly.pro\n',
    );
    const env: NodeJS.ProcessEnv = {
      OTHER_FLAG: 'already',
      KHIRBY_PLUGINS_LOCAL: '',
      CONTROL_PLANE_URL: '',
    };
    applyRootEnvFile(root, env);
    expect(env.KHIRBY_PLUGINS_LOCAL).toBe('');
    expect(env.CONTROL_PLANE_URL).toBe('');
    expect(env.OTHER_FLAG).toBe('already');
  });

  it('pluginVolumeRoot rejects first-party dirs', () => {
    const prev = process.env.KHIRBY_PLUGINS_LOCAL;
    delete process.env.KHIRBY_PLUGINS_LOCAL;
    try {
      expect(() => pluginVolumeRoot('/tmp', 'crm-plugin-mcp')).toThrow('reserved_dir');
    } finally {
      if (prev === undefined) delete process.env.KHIRBY_PLUGINS_LOCAL;
      else process.env.KHIRBY_PLUGINS_LOCAL = prev;
    }
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
    expect(() => listInstancePluginFiles(root, 'missing-dir')).toThrow('not_found');
  });

  it('resolveInstancePluginDirectory maps SPA slug and crm_* name to the volume folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'instance-resolve-'));
    const local = 'hello-world';
    writePlugin(join(root, local), { name: 'crm_hello_world_stats' });
    expect(resolveInstancePluginDirectory(root, local)).toBe(local);
    expect(resolveInstancePluginDirectory(root, 'crm_hello_world_stats')).toBe(local);
    expect(resolveInstancePluginDirectory(root, 'hello-world-stats')).toBe(local);
    expect(resolveInstancePluginDirectory(root, '/plugins/hello-world-stats')).toBe(local);
    expect(() => resolveInstancePluginDirectory(root, 'no-such-plugin')).toThrow('not_found');
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
    expect(src).toContain('DemoPlugin');
    expect(src).toContain('loadVolumeNestModule');
    expect(src).toContain("from '@khirby/plugin-host/volume-nest'");
    expect(src).not.toMatch(/from '@khirby\/plugin-host';/);
    expect(src).not.toContain("from './nest-module'");
    expect(src).not.toContain('require(');
    expect(src).not.toContain('ts-node');
    expect(src).not.toContain('createRequire');
    expect(src).not.toContain('GeneratedPlugin');
    const nestSrc = readFileSync(join(result.directory, 'src/nest-module.ts'), 'utf8');
    expect(nestSrc).toContain("from '@khirby/plugin-host'");
    expect(nestSrc).toContain('DemoController');
    expect(nestSrc).toContain('DemoNestModule');
    expect(nestSrc).toContain('as PluginNestModule');
    expect(nestSrc).toContain('stats:');
    expect(nestSrc).not.toContain('require(');
    expect(scaffoldFileMap({ directory: 'x', name: 'crm_x' })['package.json']).toContain(
      '@khirby/plugin-sdk',
    );
    expect(scaffoldFileMap({ directory: 'x', name: 'crm_x' })['package.json']).not.toContain(
      'ts-node',
    );
    expect(pluginClassName('crm_hello_world_stats')).toBe('HelloWorldStatsPlugin');
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
