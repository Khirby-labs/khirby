import { AppException } from '../../../core/errors/app-exception';
import { MarketplaceToolsAdapter, isNewerVersion } from './marketplace-tools.adapter';

describe('isNewerVersion', () => {
  it('compares dotted numeric versions', () => {
    expect(isNewerVersion('1.1.0', '1.0.0')).toBe(true);
    expect(isNewerVersion('1.0.0', '1.1.0')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
  });
});

describe('MarketplaceToolsAdapter', () => {
  function makeAdapter(overrides: {
    list?: jest.Mock;
    install?: jest.Mock;
    catalogEntries?: Array<{ name: string; version: string }>;
    integrationsManage?: boolean;
    agentUse?: boolean;
  }) {
    const marketplace = {
      list: overrides.list ?? jest.fn().mockResolvedValue([]),
      install: overrides.install ?? jest.fn(),
    };
    const catalog = {
      load: jest.fn().mockResolvedValue({
        version: 1,
        entries: (overrides.catalogEntries ?? []).map((e) => ({
          package: `@khirby/${e.name}`,
          name: e.name,
          version: e.version,
          category: 'other',
          vendor: 'Khirby',
          icon: 'plugins',
          docsUrl: 'https://khirby.com',
        })),
      }),
    };
    const rbac = {
      hasPermission: jest.fn(async (_uid: string, resource: string) => {
        if (resource === 'integrations') return overrides.integrationsManage !== false;
        if (resource === 'agent') return overrides.agentUse !== false;
        return false;
      }),
    };
    return new MarketplaceToolsAdapter(marketplace as any, catalog as any, rbac as any);
  }

  it('exposes list and install tools', () => {
    const adapter = makeAdapter({});
    expect(adapter.definitions().map((d) => d.function.name)).toEqual([
      'list_marketplace_plugins',
      'install_marketplace_plugin',
    ]);
  });

  it('forbids without integrations:manage', async () => {
    const adapter = makeAdapter({ integrationsManage: false });
    const result = await adapter.run('u1', 'list_marketplace_plugins', {});
    expect(result).toEqual({ ok: false, code: 'forbidden', summary: 'Forbidden' });
  });

  it('lists available vs installed with catalogNewer', async () => {
    const adapter = makeAdapter({
      catalogEntries: [
        { name: 'crm_a', version: '1.1.0' },
        { name: 'crm_b', version: '1.0.0' },
      ],
      list: jest.fn().mockResolvedValue([
        {
          name: 'crm_a',
          displayName: 'Plugin A',
          description: 'Alpha plugin',
          version: '1.0.0',
          status: 'installed',
          enabled: true,
          category: 'automation',
          vendor: 'Khirby',
          icon: 'plugins',
          docsUrl: null,
          configSchema: [],
        },
        {
          name: 'crm_b',
          displayName: 'Plugin B',
          description: null,
          version: '1.0.0',
          status: 'available',
          enabled: false,
          category: 'ai',
          vendor: 'Khirby',
          icon: 'plugins',
          docsUrl: null,
          configSchema: [],
        },
        {
          name: 'crm_hello_world_stats',
          displayName: 'Hello World Stats',
          description: null,
          version: '0.1.0',
          status: 'installed',
          enabled: true,
          category: 'other',
          vendor: null,
          icon: 'plugins',
          docsUrl: null,
          configSchema: [],
        },
      ]),
    });

    const result = await adapter.run('u1', 'list_marketplace_plugins', {});
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('2 catalog plugin(s)');
    expect(result.summary).toContain(
      'crm_a | inCatalog=yes | status=installed | version=1.0.0 | catalogVersion=1.1.0 | catalogNewer=yes',
    );
    expect(result.summary).toContain(
      'crm_b | inCatalog=yes | status=available | version=1.0.0 | catalogVersion=1.0.0 | catalogNewer=no',
    );
    expect(result.summary).toContain('1 installed outside catalog');
    expect(result.summary).toContain('NOT published in Marketplace');
    expect(result.summary).toContain(
      'crm_hello_world_stats | inCatalog=no | status=installed | version=0.1.0 | catalogVersion=none | catalogNewer=no',
    );
    expect(result.summary).toContain('enabled=true');
    expect(result.summary).toContain('displayName=Plugin A');
  });

  it('installs by crm_* name', async () => {
    const install = jest.fn().mockResolvedValue({
      name: 'crm_b',
      version: '1.0.0',
      enabled: true,
    });
    const adapter = makeAdapter({ install });
    const result = await adapter.run('u1', 'install_marketplace_plugin', { name: 'crm_b' });
    expect(install).toHaveBeenCalledWith('crm_b');
    expect(result).toEqual({
      ok: true,
      summary: expect.stringContaining('Installed crm_b v1.0.0'),
    });
  });

  it('maps 409 conflict from install', async () => {
    const adapter = makeAdapter({
      install: jest
        .fn()
        .mockImplementation(() =>
          Promise.reject(AppException.alreadyExists('plugin', 'name', 'crm_a')),
        ),
    });
    const result = await adapter.run('u1', 'install_marketplace_plugin', { name: 'crm_a' });
    expect(result).toEqual({
      ok: false,
      code: 'conflict',
      summary: expect.any(String),
    });
  });
});
