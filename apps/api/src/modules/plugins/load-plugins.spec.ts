import { loadPlugins } from './load-plugins.generated';

describe('loadPlugins (manifest)', () => {
  it('loads every first-party plugin from plugins.manifest.json', () => {
    const plugins = loadPlugins();
    const names = plugins.map((p) => p.name).sort();
    expect(names).toEqual(
      [
        'crm_ai_compose',
        'crm_discord',
        'crm_listmonk',
        'crm_mcp',
        'crm_pokelo',
        'crm_webhook',
      ].sort(),
    );
  });

  it('each plugin exposes name, displayName, and version', () => {
    for (const plugin of loadPlugins()) {
      expect(plugin.name).toMatch(/^crm_/);
      expect(plugin.displayName.length).toBeGreaterThan(0);
      expect(plugin.version).toMatch(/^\d+\.\d+\.\d+/);
    }
  });
});
