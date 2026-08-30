import { loadPlugins } from './load-plugins.generated';
import { NATIVE_PLUGIN_NAMES } from './plugin-registry.service';

describe('loadPlugins (manifest)', () => {
  /*
   * Containment, not equality. The manifest gains entries over time — the
   * Marketplace fixture is the first — and an exact list would turn every future
   * addition into a failure in a spec that has nothing to do with it.
   *
   * What must hold is the direction that actually matters: every plugin the boot
   * seed expects has to be loadable, or a fresh instance comes up missing one.
   */
  it('loads every plugin the native seed expects', () => {
    const names = loadPlugins().map((p) => p.name);
    for (const native of NATIVE_PLUGIN_NAMES) {
      expect(names).toContain(native);
    }
  });

  it('declares no duplicate plugin names', () => {
    const names = loadPlugins().map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('each plugin exposes name, displayName, and version', () => {
    for (const plugin of loadPlugins()) {
      expect(plugin.name).toMatch(/^crm_/);
      expect(plugin.displayName.length).toBeGreaterThan(0);
      expect(plugin.version).toMatch(/^\d+\.\d+\.\d+/);
    }
  });
});
