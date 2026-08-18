import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendInstanceManifest,
  isSafeLocalSegment,
  loadInstancePlugins,
  loadPluginFromDir,
  packageDeclaresWeb,
} from './instance-plugins.loader';

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
      join(root, 'plugins.manifest.json'),
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
});
