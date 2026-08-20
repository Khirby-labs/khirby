import {
  pendingPluginDirectories,
  pluginAwareFallbackSummary,
  pluginInstallSucceeded,
  trackPluginDirectory,
} from './plugin-agent-tracker';

describe('plugin-agent-tracker', () => {
  it('marks directory pending after write and cleared after install', () => {
    const pending = new Set<string>();
    const installed = new Set<string>();

    trackPluginDirectory(
      pending,
      installed,
      'write_instance_plugin_file',
      { directory: 'demo' },
      {
        ok: true,
        summary: 'wrote',
      },
    );
    expect(pendingPluginDirectories(pending, installed)).toEqual(['demo']);

    trackPluginDirectory(
      pending,
      installed,
      'install_instance_plugin',
      { directory: 'demo' },
      {
        ok: true,
        summary: 'Installed crm_demo',
      },
    );
    expect(pendingPluginDirectories(pending, installed)).toEqual([]);
    expect(installed.has('demo')).toBe(true);
  });

  it('treats scaffold with install as installed', () => {
    expect(
      pluginInstallSucceeded('scaffold_plugin', {
        ok: true,
        summary: 'Scaffolded and installed crm_demo (installed)',
      }),
    ).toBe(true);
    expect(
      pluginInstallSucceeded('scaffold_plugin', {
        ok: true,
        summary: 'Scaffolded only — call install',
      }),
    ).toBe(false);
  });

  it('fallback refuses success when only writes happened', () => {
    const summary = pluginAwareFallbackSummary([
      {
        name: 'write_instance_plugin_file',
        args: { directory: 'demo' },
        ok: true,
        summary: 'Wrote index.ts',
      },
    ]);
    expect(summary).toContain('not installed');
  });
});
