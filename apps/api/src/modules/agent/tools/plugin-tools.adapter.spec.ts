import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  INSTANCE_PLUGINS,
  POKELO_CONTEXT_SERVICE,
  type InstancePluginsLike,
} from '../../../../../../packages/plugin-host/src/tokens';
import { PluginToolsAdapter, PokeloToolsAdapter } from './plugin-tools.adapter';
import { RbacService } from '../../../core/rbac/rbac.service';

describe('PluginToolsAdapter', () => {
  let adapter: PluginToolsAdapter;
  let rbac: jest.Mocked<Pick<RbacService, 'hasPermission'>>;
  let instancePlugins: jest.Mocked<
    Pick<
      InstancePluginsLike,
      | 'loadedNames'
      | 'pluginContract'
      | 'scaffold'
      | 'writeFile'
      | 'readFile'
      | 'listFiles'
      | 'installFromDirectory'
      | 'removeInstance'
      | 'reloadFromDirectory'
      | 'frontendPages'
    >
  >;

  beforeEach(async () => {
    rbac = {
      hasPermission: jest.fn(async (_uid, resource, action) => {
        if (resource === 'integrations' && action === 'manage') return true;
        if (resource === 'agent' && action === 'use') return true;
        return false;
      }),
    };
    instancePlugins = {
      loadedNames: jest.fn().mockReturnValue(['crm_hello']),
      pluginContract: jest.fn().mockReturnValue('contract text'),
      scaffold: jest.fn().mockReturnValue({ directory: 'my_plugin', files: ['index.ts'] }),
      writeFile: jest.fn().mockReturnValue({ path: 'index.ts', bytes: 12 }),
      readFile: jest.fn().mockReturnValue({ content: 'file body' }),
      listFiles: jest.fn().mockReturnValue({ files: ['package.json', 'src/index.ts'] }),
      installFromDirectory: jest.fn().mockResolvedValue({ name: 'my_plugin', status: 'installed' }),
      removeInstance: jest.fn().mockResolvedValue({ name: 'my_plugin' }),
      reloadFromDirectory: jest.fn().mockResolvedValue({ name: 'my_plugin', status: 'reloaded' }),
      frontendPages: jest
        .fn()
        .mockReturnValue([{ path: '/plugins/my-plugin', navLabel: 'My Plugin' }]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PluginToolsAdapter,
        { provide: INSTANCE_PLUGINS, useValue: instancePlugins },
        { provide: RbacService, useValue: rbac },
      ],
    }).compile();

    adapter = moduleRef.get(PluginToolsAdapter);
  });

  it('lists installed plugins when permitted', async () => {
    const result = await adapter.run('user-1', 'list_installed_plugins', {});
    expect(result).toEqual({ ok: true, summary: 'crm_hello' });
  });

  it('requires integrations:manage and agent:use', async () => {
    rbac.hasPermission.mockResolvedValue(false);
    const result = await adapter.run('user-1', 'list_installed_plugins', {});
    expect(result).toEqual({ ok: false, code: 'forbidden', summary: 'Forbidden' });
  });

  it('scaffolds with nest true by default and installs', async () => {
    const result = await adapter.run('user-1', 'scaffold_plugin', {
      directory: 'crm-plugin-demo',
      name: 'crm_demo',
    });
    expect(instancePlugins.scaffold).toHaveBeenCalledWith(expect.objectContaining({ nest: true }));
    expect(instancePlugins.installFromDirectory).toHaveBeenCalledWith('crm-plugin-demo');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toContain('Scaffolded and installed');
      expect(result.summary).toContain('SPA page: /plugins/my-plugin (My Plugin)');
    }
    expect(instancePlugins.frontendPages).toHaveBeenCalledWith('my_plugin');
  });

  it('rejects write before scaffold', async () => {
    instancePlugins.listFiles = jest.fn().mockReturnValue({ files: [] });
    const result = await adapter.run('user-1', 'write_instance_plugin_file', {
      directory: 'crm-plugin-demo',
      path: 'src/index.ts',
      content: 'bad',
    });
    expect(result).toEqual({
      ok: false,
      code: 'no_scaffold',
      summary: expect.stringContaining('scaffold_plugin'),
    });
    expect(instancePlugins.writeFile).not.toHaveBeenCalled();
  });

  it('reloads live GET handlers after a successful write', async () => {
    const result = await adapter.run('user-1', 'write_instance_plugin_file', {
      directory: 'crm-plugin-demo',
      path: 'src/nest-module.ts',
      content: 'updated',
    });
    expect(instancePlugins.writeFile).toHaveBeenCalled();
    expect(instancePlugins.reloadFromDirectory).toHaveBeenCalledWith('crm-plugin-demo');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.summary).toContain('live GET handler reloaded');
  });

  it('scaffolds without install when install is false', async () => {
    const result = await adapter.run('user-1', 'scaffold_plugin', {
      directory: 'crm-plugin-demo',
      name: 'crm_demo',
      install: false,
    });
    expect(instancePlugins.installFromDirectory).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.summary).toContain('call install_instance_plugin');
  });

  it('returns install_failed when scaffold succeeds but install throws', async () => {
    instancePlugins.installFromDirectory.mockRejectedValue(
      new BadRequestException('Plugin validation failed: navLabel missing'),
    );
    const result = await adapter.run('user-1', 'scaffold_plugin', {
      directory: 'crm-plugin-demo',
      name: 'crm_demo',
    });
    expect(result).toEqual({
      ok: false,
      code: 'install_failed',
      summary: expect.stringContaining('install failed'),
    });
  });

  it('installs an instance plugin through the registry', async () => {
    const result = await adapter.run('user-1', 'install_instance_plugin', {
      directory: 'my_plugin',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toContain('Installed my_plugin');
      expect(result.summary).toContain('SPA page: /plugins/my-plugin (My Plugin)');
    }
    expect(instancePlugins.installFromDirectory).toHaveBeenCalledWith('my_plugin', undefined);
    expect(instancePlugins.frontendPages).toHaveBeenCalledWith('my_plugin');
  });

  it('reports SPA page: none when the installed plugin has no UI route', async () => {
    instancePlugins.frontendPages.mockReturnValue([]);
    const result = await adapter.run('user-1', 'install_instance_plugin', {
      directory: 'my_plugin',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.summary).toContain('SPA page: none');
  });

  it('removes an instance plugin', async () => {
    const result = await adapter.run('user-1', 'remove_instance_plugin', {
      directory: 'my_plugin',
    });
    expect(result.ok).toBe(true);
    expect(instancePlugins.removeInstance).toHaveBeenCalledWith('my_plugin');
  });

  it('returns validation messages instead of a generic tool failure', async () => {
    instancePlugins.installFromDirectory.mockRejectedValue(
      new BadRequestException('Plugin validation failed: navLabel missing'),
    );
    const result = await adapter.run('user-1', 'install_instance_plugin', {
      directory: 'my_plugin',
    });
    expect(result).toEqual({
      ok: false,
      code: 'tool_error',
      summary: 'Plugin validation failed: navLabel missing',
    });
  });
});

describe('PokeloToolsAdapter', () => {
  let adapter: PokeloToolsAdapter;
  let rbac: jest.Mocked<Pick<RbacService, 'hasPermission'>>;

  beforeEach(async () => {
    rbac = { hasPermission: jest.fn().mockResolvedValue(true) };
  });

  it('returns no definitions when Pokelo is not configured', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PokeloToolsAdapter,
        { provide: POKELO_CONTEXT_SERVICE, useValue: null },
        { provide: RbacService, useValue: rbac },
      ],
    }).compile();
    adapter = moduleRef.get(PokeloToolsAdapter);

    expect(adapter.definitions()).toEqual([]);
    await expect(adapter.run('user-1', 'search_knowledge_base', { query: 'x' })).resolves.toEqual({
      ok: false,
      code: 'unavailable',
      summary: 'Pokelo not configured',
    });
  });

  it('searches the knowledge base when configured', async () => {
    const pokelo = { fetchContext: jest.fn().mockResolvedValue('snippet one') };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PokeloToolsAdapter,
        { provide: POKELO_CONTEXT_SERVICE, useValue: pokelo },
        { provide: RbacService, useValue: rbac },
      ],
    }).compile();
    adapter = moduleRef.get(PokeloToolsAdapter);

    expect(adapter.definitions().map((d) => d.function.name)).toEqual(['search_knowledge_base']);
    await expect(
      adapter.run('user-1', 'search_knowledge_base', { query: 'pipeline' }),
    ).resolves.toEqual({ ok: true, summary: 'snippet one' });
  });
});
