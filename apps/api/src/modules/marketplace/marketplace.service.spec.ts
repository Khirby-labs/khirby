import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MarketplaceService, pickCompatiblePluginVersion } from './marketplace.service';
import { CATALOG_FORMAT_VERSION, CatalogDocument, CatalogEntry } from './catalog';
import { appendInstanceManifest } from '../plugins/instance-plugins.loader';

function makeCatalog(document: CatalogDocument) {
  return { load: jest.fn().mockResolvedValue(document), invalidate: jest.fn() } as any;
}

function entry(
  overrides: Partial<CatalogEntry> & Pick<CatalogEntry, 'name' | 'slug'>,
): CatalogEntry {
  return {
    package: `@khirby/plugin-${overrides.name.replace(/^crm_/, '')}`,
    packageName: `@khirby/plugin-${overrides.name.replace(/^crm_/, '')}`,
    version: '1.0.0',
    latestVersion: '1.0.0',
    category: 'automation',
    vendor: 'Khirby',
    publisherName: 'Khirby',
    icon: 'plugins',
    docsUrl: `https://khirby.com/docs/plugins/${overrides.slug}`,
    displayName: overrides.name,
    description: null,
    verified: true,
    compatible: true,
    permissions: null,
    ...overrides,
  };
}

function catalogWith(
  entries: Array<Partial<CatalogEntry> & Pick<CatalogEntry, 'name' | 'slug'>>,
): CatalogDocument {
  return {
    version: CATALOG_FORMAT_VERSION,
    entries: entries.map((e) => entry(e)),
  };
}

function makeRegistry(options: {
  loaded: string[];
  installed?: Array<Record<string, unknown>>;
  available?: Array<Record<string, unknown>>;
  install?: jest.Mock;
  installFromDirectory?: jest.Mock;
  findAll?: jest.Mock;
  findByName?: jest.Mock;
}) {
  return {
    loadedNames: () => options.loaded,
    snapshot: jest.fn().mockResolvedValue({
      installed: options.installed ?? [],
      available: options.available ?? [],
    }),
    install: options.install ?? jest.fn().mockResolvedValue({ name: 'x', enabled: true }),
    installFromDirectory:
      options.installFromDirectory ??
      jest.fn().mockResolvedValue({ name: 'crm_a', status: 'installed' }),
    upgradeFromDirectory:
      (options as { upgradeFromDirectory?: jest.Mock }).upgradeFromDirectory ??
      jest.fn().mockResolvedValue({ name: 'crm_a', version: '1.2.0' }),
    reloadFromDirectory: jest.fn().mockResolvedValue({ name: 'crm_a', status: 'reloaded' }),
    restoreAfterFailedUpgrade: jest.fn().mockResolvedValue({ name: 'crm_a', status: 'restored' }),
    findAll: options.findAll ?? jest.fn().mockResolvedValue([]),
    findByName: options.findByName ?? jest.fn().mockResolvedValue(null),
    instanceDir: () => '/tmp/khirby-no-plugin-volume',
  } as any;
}

function makeCp(overrides: Record<string, unknown> = {}) {
  return {
    isConfigured: () => true,
    getPlugin: jest.fn().mockResolvedValue(null),
    getPluginVersion: jest.fn().mockResolvedValue(null),
    getPluginVersions: jest.fn().mockResolvedValue([]),
    submitPlugin: jest.fn().mockResolvedValue(null),
    ...overrides,
  } as any;
}

function makeInstaller(overrides: Record<string, unknown> = {}) {
  return {
    extract: jest.fn().mockResolvedValue({
      directory: 'plugin-a',
      absDir: '/tmp/plugins/plugin-a',
      packageName: '@khirby/plugin-a',
      commit: jest.fn(),
      rollback: jest.fn(),
    }),
    ...overrides,
  } as any;
}

function makeConfig(appVersion = '1.2.0') {
  return { get: jest.fn((key: string) => (key === 'APP_VERSION' ? appVersion : undefined)) } as any;
}

function makeIdentity() {
  return {
    getOrCreate: jest
      .fn()
      .mockResolvedValue({ installationId: '11111111-1111-1111-1111-111111111111' }),
  } as any;
}

function installedRow(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    displayName: name,
    description: null,
    version: '1.0.0',
    enabled: true,
    configSchema: [],
    ...overrides,
  };
}

function makeService(parts: {
  catalog?: CatalogDocument;
  catalogMock?: ReturnType<typeof makeCatalog>;
  registry?: ReturnType<typeof makeRegistry>;
  cp?: ReturnType<typeof makeCp>;
  installer?: ReturnType<typeof makeInstaller>;
  appVersion?: string;
}) {
  return new MarketplaceService(
    parts.catalogMock ?? makeCatalog(parts.catalog ?? catalogWith([])),
    parts.registry ?? makeRegistry({ loaded: [] }),
    parts.cp ?? makeCp(),
    parts.installer ?? makeInstaller(),
    makeIdentity(),
    makeConfig(parts.appVersion),
  );
}

describe('MarketplaceService.list', () => {
  it('marks a catalog plugin with a row installed and one without available', async () => {
    const svc = makeService({
      catalog: catalogWith([
        { name: 'crm_a', slug: 'a' },
        { name: 'crm_b', slug: 'b' },
      ]),
      registry: makeRegistry({
        loaded: ['crm_a'],
        installed: [installedRow('crm_a')],
      }),
    });

    const cards = await svc.list();
    expect(cards.map((c) => [c.name, c.status, c.enabled])).toEqual([
      ['crm_a', 'installed', true],
      ['crm_b', 'available', false],
    ]);
  });

  it('shows a CP plugin even when it is absent from this image', async () => {
    const svc = makeService({
      catalog: catalogWith([{ name: 'crm_ghost', slug: 'ghost' }]),
      registry: makeRegistry({ loaded: [] }),
    });

    const cards = await svc.list();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual(
      expect.objectContaining({
        name: 'crm_ghost',
        slug: 'ghost',
        status: 'available',
        verified: true,
        packageName: '@khirby/plugin-ghost',
      }),
    );
  });

  it('carries CP metadata onto the card', async () => {
    const svc = makeService({
      catalog: catalogWith([
        {
          name: 'crm_a',
          slug: 'a',
          permissions: ['contacts:read'],
          publisherName: 'Acme',
          vendor: 'Acme',
          verified: true,
          compatible: false,
          latestVersion: '2.0.0',
        },
      ]),
      registry: makeRegistry({ loaded: [] }),
    });

    const [card] = await svc.list();
    expect(card).toEqual(
      expect.objectContaining({
        publisherName: 'Acme',
        vendor: 'Acme',
        verified: true,
        compatible: false,
        permissions: ['contacts:read'],
        latestVersion: '2.0.0',
        packageName: '@khirby/plugin-a',
        slug: 'a',
        updateAvailable: false,
      }),
    );
  });

  it('flags updateAvailable when the installed row is behind latestVersion', async () => {
    const svc = makeService({
      catalog: catalogWith([
        {
          name: 'crm_a',
          slug: 'a',
          latestVersion: '2.0.0',
          version: '2.0.0',
        },
      ]),
      registry: makeRegistry({
        loaded: ['crm_a'],
        installed: [installedRow('crm_a', { version: '1.0.0' })],
      }),
    });

    const [card] = await svc.list();
    expect(card).toEqual(
      expect.objectContaining({
        status: 'installed',
        version: '1.0.0',
        latestVersion: '2.0.0',
        updateAvailable: true,
      }),
    );
  });

  it('flags updateAvailable from the Marketplace unpack when the row was rewritten by a checkout', async () => {
    const volume = mkdtempSync(join(tmpdir(), 'mkt-unpack-'));
    const unpack = join(volume, 'khirby__plugin-pokelo');
    mkdirSync(join(unpack, 'src'), { recursive: true });
    writeFileSync(
      join(unpack, 'package.json'),
      JSON.stringify({
        name: '@khirby/plugin-pokelo',
        version: '1.0.0',
        main: './src/index.ts',
      }),
    );
    writeFileSync(
      join(unpack, 'src/index.ts'),
      `export function createPlugin() {
  return { name: 'crm_pokelo', displayName: 'Pokelo', version: '1.0.1' };
}
`,
    );
    appendInstanceManifest(volume, '@khirby/plugin-pokelo', 'khirby__plugin-pokelo');

    const svc = makeService({
      catalog: catalogWith([
        {
          name: 'crm_pokelo',
          slug: 'crm-pokelo',
          latestVersion: '1.0.1',
          version: '1.0.1',
        },
      ]),
      registry: {
        ...makeRegistry({
          loaded: ['crm_pokelo'],
          installed: [installedRow('crm_pokelo', { version: '1.0.1' })],
        }),
        instanceDir: () => volume,
      },
    });

    const [card] = await svc.list();
    expect(card).toEqual(
      expect.objectContaining({
        status: 'installed',
        version: '1.0.0',
        latestVersion: '1.0.1',
        updateAvailable: true,
      }),
    );
  });

  it('keeps an installed plugin whose catalog entry is missing, under the other category', async () => {
    const svc = makeService({
      catalog: catalogWith([]),
      registry: makeRegistry({ loaded: ['crm_a'], installed: [installedRow('crm_a')] }),
    });

    const [card] = await svc.list();
    expect(card).toEqual(
      expect.objectContaining({
        name: 'crm_a',
        status: 'installed',
        category: 'other',
        vendor: null,
        docsUrl: null,
        icon: 'plugins',
      }),
    );
  });

  it('skips an orphan row whose plugin left the process', async () => {
    const svc = makeService({
      catalog: catalogWith([{ name: 'crm_a', slug: 'a' }]),
      registry: makeRegistry({
        loaded: ['crm_a'],
        installed: [installedRow('crm_a'), installedRow('crm_removed')],
      }),
    });

    expect((await svc.list()).map((c) => c.name)).toEqual(['crm_a']);
  });

  it('takes installed state from a single registry snapshot', async () => {
    const registry = makeRegistry({
      loaded: ['crm_a'],
      installed: [installedRow('crm_a')],
    });
    const svc = makeService({
      catalog: catalogWith([{ name: 'crm_a', slug: 'a' }]),
      registry,
    });

    await svc.list();
    expect(registry.snapshot).toHaveBeenCalledTimes(1);
  });

  it('reflects an install immediately even though the catalog document is cached', async () => {
    const catalog = makeCatalog(catalogWith([{ name: 'crm_a', slug: 'a' }]));
    const registry = makeRegistry({ loaded: [], installed: [] });
    const svc = new MarketplaceService(
      catalog,
      registry,
      makeCp(),
      makeInstaller(),
      makeIdentity(),
      makeConfig(),
    );

    expect((await svc.list())[0].status).toBe('available');

    registry.snapshot.mockResolvedValue({
      installed: [installedRow('crm_a')],
      available: [],
    });

    expect((await svc.list())[0].status).toBe('installed');
    expect(catalog.load).toHaveBeenCalledTimes(2);
    expect(catalog.load).toHaveBeenCalledWith();
  });

  it('does not force a fresh Control Plane fetch on list', async () => {
    const catalog = makeCatalog(catalogWith([{ name: 'crm_a', slug: 'a' }]));
    const svc = new MarketplaceService(
      catalog,
      makeRegistry({ loaded: [] }),
      makeCp(),
      makeInstaller(),
      makeIdentity(),
      makeConfig(),
    );
    await svc.list();
    expect(catalog.load).toHaveBeenCalledWith();
    expect(catalog.load).not.toHaveBeenCalledWith(undefined, { fresh: true });
  });
});

describe('MarketplaceService.findOne', () => {
  it('finds by crm name or slug', async () => {
    const svc = makeService({
      catalog: catalogWith([{ name: 'crm_a', slug: 'alpha' }]),
      registry: makeRegistry({ loaded: [] }),
    });

    expect((await svc.findOne('crm_a')).slug).toBe('alpha');
    expect((await svc.findOne('alpha')).name).toBe('crm_a');
  });

  it('rejects an unknown name', async () => {
    const svc = makeService({
      catalog: catalogWith([{ name: 'crm_a', slug: 'a' }]),
      registry: makeRegistry({ loaded: [] }),
    });
    await expect(svc.findOne('crm_nope')).rejects.toThrow(NotFoundException);
  });
});

describe('MarketplaceService.install', () => {
  const versionMeta = {
    version: '1.0.0',
    packageName: '@khirby/plugin-a',
    checksum: 'sha512-abc',
    minimumProductVersion: null,
    manifest: { id: 'crm_a' },
    permissions: null,
    publishedAt: '2026-01-01T00:00:00.000Z',
    approvedAt: '2026-01-02T00:00:00.000Z',
  };

  it('delegates to registry.install when the plugin is already loaded', async () => {
    const install = jest.fn().mockResolvedValue({ name: 'crm_a', enabled: true });
    const getPlugin = jest.fn().mockResolvedValue({
      slug: 'a',
      name: 'A',
      description: null,
      packageName: '@khirby/plugin-a',
      publisherName: 'Khirby',
      verified: true,
      repositoryUrl: null,
      latestVersion: '1.0.0',
      permissions: null,
    });
    const getPluginVersion = jest.fn().mockResolvedValue(versionMeta);
    const extract = jest.fn();

    const svc = makeService({
      registry: makeRegistry({ loaded: ['crm_a'], install }),
      cp: makeCp({ getPlugin, getPluginVersion }),
      installer: makeInstaller({ extract }),
    });

    await svc.install('a');
    expect(install).toHaveBeenCalledWith('crm_a');
    expect(extract).not.toHaveBeenCalled();
  });

  it('downloads and installFromDirectory when the plugin is not loaded', async () => {
    const installFromDirectory = jest
      .fn()
      .mockResolvedValue({ name: 'crm_a', status: 'installed' });
    const findAll = jest
      .fn()
      .mockResolvedValue([{ name: 'crm_a', enabled: true, version: '1.0.0' }]);
    const commit = jest.fn();
    const rollback = jest.fn();
    const extract = jest.fn().mockResolvedValue({
      directory: 'plugin-a',
      absDir: '/tmp/khirby-no-such-plugin-dir',
      packageName: '@khirby/plugin-a',
      commit,
      rollback,
    });
    const getPlugin = jest.fn().mockResolvedValue({
      slug: 'a',
      name: 'A',
      description: null,
      packageName: '@khirby/plugin-a',
      publisherName: 'Khirby',
      verified: true,
      repositoryUrl: null,
      latestVersion: '1.0.0',
      permissions: null,
    });

    const catalog = makeCatalog(catalogWith([]));
    const svc = makeService({
      catalogMock: catalog,
      registry: makeRegistry({ loaded: [], installFromDirectory, findAll }),
      cp: makeCp({
        getPlugin,
        getPluginVersion: jest.fn().mockResolvedValue(versionMeta),
      }),
      installer: makeInstaller({ extract }),
    });

    const result = await svc.install('a');
    expect(extract).toHaveBeenCalledWith({
      packageName: '@khirby/plugin-a',
      version: '1.0.0',
      checksum: 'sha512-abc',
    });
    expect(installFromDirectory).toHaveBeenCalledWith('plugin-a', '@khirby/plugin-a', {
      allowReservedScaffoldDirs: true,
    });
    expect(result).toEqual(expect.objectContaining({ name: 'crm_a' }));
    expect(commit).toHaveBeenCalled();
    expect(rollback).not.toHaveBeenCalled();
    expect(catalog.invalidate).toHaveBeenCalled();
  });

  it('refuses an unknown slug without asking the installer', async () => {
    const extract = jest.fn();
    const svc = makeService({
      catalog: catalogWith([]),
      registry: makeRegistry({ loaded: [] }),
      cp: makeCp({ getPlugin: jest.fn().mockResolvedValue(null) }),
      installer: makeInstaller({ extract }),
    });

    await expect(svc.install('nope')).rejects.toThrow(NotFoundException);
    expect(extract).not.toHaveBeenCalled();
  });

  it('lets the registry conflict surface for an already-installed plugin', async () => {
    const install = jest.fn().mockRejectedValue(new ConflictException('already'));
    const svc = makeService({
      registry: makeRegistry({ loaded: ['crm_a'], install }),
      cp: makeCp({
        getPlugin: jest.fn().mockResolvedValue({
          slug: 'a',
          name: 'A',
          description: null,
          packageName: '@khirby/plugin-a',
          publisherName: 'Khirby',
          verified: true,
          repositoryUrl: null,
          latestVersion: '1.0.0',
          permissions: null,
        }),
        getPluginVersion: jest.fn().mockResolvedValue(versionMeta),
      }),
    });

    await expect(svc.install('a')).rejects.toThrow(ConflictException);
  });

  it('installs a loaded plugin by crm name when CP has no match', async () => {
    const install = jest.fn().mockResolvedValue({ name: 'crm_local', enabled: true });
    const svc = makeService({
      catalog: catalogWith([]),
      registry: makeRegistry({ loaded: ['crm_local'], install }),
      cp: makeCp({ getPlugin: jest.fn().mockResolvedValue(null) }),
    });

    await svc.install('crm_local');
    expect(install).toHaveBeenCalledWith('crm_local');
  });

  it('rejects install when no version has approvedAt', async () => {
    const extract = jest.fn();
    const getPlugin = jest.fn().mockResolvedValue({
      slug: 'a',
      name: 'A',
      description: null,
      packageName: '@khirby/plugin-a',
      publisherName: 'Khirby',
      verified: true,
      repositoryUrl: null,
      latestVersion: null,
      permissions: null,
    });
    const getPluginVersions = jest.fn().mockResolvedValue([
      {
        ...versionMeta,
        approvedAt: null,
      },
    ]);

    const svc = makeService({
      registry: makeRegistry({ loaded: [] }),
      cp: makeCp({
        getPlugin,
        getPluginVersions,
        getPluginVersion: jest.fn().mockResolvedValue(null),
      }),
      installer: makeInstaller({ extract }),
    });

    await expect(svc.install('a')).rejects.toThrow(NotFoundException);
    expect(extract).not.toHaveBeenCalled();
  });

  it('returns upstreamFailed when Control Plane version list soft-fails', async () => {
    const extract = jest.fn();
    const getPlugin = jest.fn().mockResolvedValue({
      slug: 'a',
      name: 'A',
      description: null,
      packageName: '@khirby/plugin-a',
      publisherName: 'Khirby',
      verified: true,
      repositoryUrl: null,
      latestVersion: '1.0.0',
      permissions: null,
    });

    const svc = makeService({
      registry: makeRegistry({ loaded: [] }),
      cp: makeCp({
        getPlugin,
        getPluginVersion: jest.fn().mockResolvedValue(null),
        getPluginVersions: jest.fn().mockResolvedValue(null),
      }),
      installer: makeInstaller({ extract }),
    });

    await expect(svc.install('a')).rejects.toThrow(ServiceUnavailableException);
    expect(extract).not.toHaveBeenCalled();
  });

  it('installs the newest approved version compatible with APP_VERSION, not CP latestVersion', async () => {
    const compatible = {
      ...versionMeta,
      version: '1.5.0',
      minimumProductVersion: '1.2.0',
      publishedAt: '2026-02-01T00:00:00.000Z',
      approvedAt: '2026-02-02T00:00:00.000Z',
    };
    const tooNew = {
      ...versionMeta,
      version: '2.0.0',
      minimumProductVersion: '1.3.0',
      publishedAt: '2026-03-01T00:00:00.000Z',
      approvedAt: '2026-03-02T00:00:00.000Z',
    };
    const extract = jest.fn().mockResolvedValue({
      directory: 'plugin-a',
      absDir: '/tmp/khirby-no-such-plugin-dir',
      packageName: '@khirby/plugin-a',
      commit: jest.fn(),
      rollback: jest.fn(),
    });
    const getPlugin = jest.fn().mockResolvedValue({
      slug: 'a',
      name: 'A',
      description: null,
      packageName: '@khirby/plugin-a',
      publisherName: 'Khirby',
      verified: true,
      repositoryUrl: null,
      latestVersion: '2.0.0',
      permissions: null,
    });

    const svc = makeService({
      appVersion: '1.2.0',
      registry: makeRegistry({
        loaded: [],
        installFromDirectory: jest.fn().mockResolvedValue({ name: 'crm_a', status: 'installed' }),
        findAll: jest.fn().mockResolvedValue([{ name: 'crm_a', enabled: true, version: '1.5.0' }]),
      }),
      cp: makeCp({
        getPlugin,
        getPluginVersion: jest.fn().mockResolvedValue(tooNew),
        getPluginVersions: jest.fn().mockResolvedValue([compatible, tooNew]),
      }),
      installer: makeInstaller({ extract }),
    });

    await svc.install('a');
    expect(extract).toHaveBeenCalledWith({
      packageName: '@khirby/plugin-a',
      version: '1.5.0',
      checksum: 'sha512-abc',
    });
  });

  it('refuses install when every approved version needs a newer Khirby', async () => {
    const extract = jest.fn();
    const tooNew = {
      ...versionMeta,
      version: '2.0.0',
      minimumProductVersion: '1.3.0',
    };
    const svc = makeService({
      appVersion: '1.2.0',
      registry: makeRegistry({ loaded: [] }),
      cp: makeCp({
        getPlugin: jest.fn().mockResolvedValue({
          slug: 'a',
          name: 'A',
          description: null,
          packageName: '@khirby/plugin-a',
          publisherName: 'Khirby',
          verified: true,
          repositoryUrl: null,
          latestVersion: '2.0.0',
          permissions: null,
        }),
        getPluginVersion: jest.fn().mockResolvedValue(tooNew),
        getPluginVersions: jest.fn().mockResolvedValue([tooNew]),
      }),
      installer: makeInstaller({ extract }),
    });

    await expect(svc.install('a')).rejects.toThrow(BadRequestException);
    expect(extract).not.toHaveBeenCalled();
  });

  it('rolls back the unpack when installFromDirectory throws', async () => {
    const commit = jest.fn();
    const rollback = jest.fn();
    const extract = jest.fn().mockResolvedValue({
      directory: 'plugin-a',
      absDir: '/tmp/khirby-no-such-plugin-dir',
      packageName: '@khirby/plugin-a',
      commit,
      rollback,
    });
    const svc = makeService({
      registry: makeRegistry({
        loaded: [],
        installFromDirectory: jest.fn().mockRejectedValue(new Error('hot-load failed')),
      }),
      cp: makeCp({
        getPlugin: jest.fn().mockResolvedValue({
          slug: 'a',
          name: 'A',
          description: null,
          packageName: '@khirby/plugin-a',
          publisherName: 'Khirby',
          verified: true,
          repositoryUrl: null,
          latestVersion: '1.0.0',
          permissions: null,
        }),
        getPluginVersion: jest.fn().mockResolvedValue(versionMeta),
      }),
      installer: makeInstaller({ extract }),
    });

    await expect(svc.install('a')).rejects.toThrow('hot-load failed');
    expect(rollback).toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });
});

describe('MarketplaceService.update', () => {
  const pluginCard = {
    slug: 'a',
    name: 'A',
    description: null,
    packageName: '@khirby/plugin-a',
    publisherName: 'Khirby',
    verified: true,
    repositoryUrl: null,
    latestVersion: '1.2.0',
    permissions: null,
  };
  const versionMeta = {
    version: '1.2.0',
    packageName: '@khirby/plugin-a',
    checksum: 'sha512-abc',
    minimumProductVersion: null,
    manifest: { id: 'crm_a' },
    permissions: null,
    publishedAt: '2026-01-01T00:00:00.000Z',
    approvedAt: '2026-01-02T00:00:00.000Z',
  };

  it('commits the swap after upgradeFromDirectory succeeds', async () => {
    const commit = jest.fn();
    const rollback = jest.fn();
    const extract = jest.fn().mockResolvedValue({
      directory: 'plugin-a',
      absDir: '/tmp/plugins/plugin-a',
      packageName: '@khirby/plugin-a',
      commit,
      rollback,
    });
    const upgradeFromDirectory = jest.fn().mockResolvedValue({ name: 'crm_a', version: '1.2.0' });
    const catalog = makeCatalog(catalogWith([]));
    const svc = makeService({
      catalogMock: catalog,
      registry: {
        ...makeRegistry({ loaded: ['crm_a'] }),
        findByName: jest.fn().mockResolvedValue(installedRow('crm_a')),
        upgradeFromDirectory,
      },
      cp: makeCp({
        getPlugin: jest.fn().mockResolvedValue(pluginCard),
        getPluginVersion: jest.fn().mockResolvedValue(versionMeta),
      }),
      installer: makeInstaller({ extract }),
    });

    await svc.update('a');
    expect(upgradeFromDirectory).toHaveBeenCalledWith('plugin-a', '@khirby/plugin-a', {
      allowReservedScaffoldDirs: true,
    });
    expect(commit).toHaveBeenCalled();
    expect(rollback).not.toHaveBeenCalled();
    expect(catalog.invalidate).toHaveBeenCalled();
  });

  it('rolls back files and restores the previous runtime when upgradeFromDirectory throws', async () => {
    const commit = jest.fn();
    const rollback = jest.fn();
    const extract = jest.fn().mockResolvedValue({
      directory: 'plugin-a',
      absDir: '/tmp/plugins/plugin-a',
      packageName: '@khirby/plugin-a',
      commit,
      rollback,
    });
    const restoreAfterFailedUpgrade = jest
      .fn()
      .mockResolvedValue({ name: 'crm_a', status: 'restored' });
    const svc = makeService({
      registry: {
        ...makeRegistry({ loaded: ['crm_a'] }),
        findByName: jest.fn().mockResolvedValue(installedRow('crm_a', { version: '1.1.0' })),
        upgradeFromDirectory: jest.fn().mockRejectedValue(new Error('migration failed')),
        restoreAfterFailedUpgrade,
      },
      cp: makeCp({
        getPlugin: jest.fn().mockResolvedValue(pluginCard),
        getPluginVersion: jest.fn().mockResolvedValue(versionMeta),
      }),
      installer: makeInstaller({ extract }),
    });

    await expect(svc.update('a')).rejects.toThrow('migration failed');
    expect(rollback).toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(restoreAfterFailedUpgrade).toHaveBeenCalledWith('plugin-a', {
      allowReservedScaffoldDirs: true,
    });
  });
});

describe('pickCompatiblePluginVersion', () => {
  const v15 = {
    version: '1.5.0',
    packageName: '@khirby/plugin-a',
    checksum: 'sha512-a',
    minimumProductVersion: '1.2.0',
    manifest: null,
    permissions: null,
    publishedAt: '2026-02-01T00:00:00.000Z',
    approvedAt: '2026-02-02T00:00:00.000Z',
  };
  const v20 = {
    version: '2.0.0',
    packageName: '@khirby/plugin-a',
    checksum: 'sha512-b',
    minimumProductVersion: '1.3.0',
    manifest: null,
    permissions: null,
    publishedAt: '2026-03-01T00:00:00.000Z',
    approvedAt: '2026-03-02T00:00:00.000Z',
  };

  it('skips a newer latest that requires a higher product version', () => {
    expect(pickCompatiblePluginVersion([v15, v20], '1.2.0', '2.0.0')?.version).toBe('1.5.0');
  });
});

describe('MarketplaceService.submit', () => {
  it('attaches installationId and proxies to the Control Plane', async () => {
    const submitPlugin = jest.fn().mockResolvedValue({
      slug: 'my-plugin',
      name: 'My Plugin',
      status: 'submitted',
      packageName: '@acme/plugin',
      submittedAt: '2026-01-01T00:00:00.000Z',
    });
    const identity = makeIdentity();
    const svc = new MarketplaceService(
      makeCatalog(catalogWith([])),
      makeRegistry({ loaded: [] }),
      makeCp({ submitPlugin }),
      makeInstaller(),
      identity,
      makeConfig(),
    );

    const result = await svc.submit({
      slug: 'my-plugin',
      name: 'My Plugin',
      packageName: '@acme/plugin',
    });

    expect(submitPlugin).toHaveBeenCalledWith({
      slug: 'my-plugin',
      name: 'My Plugin',
      packageName: '@acme/plugin',
      installationId: '11111111-1111-1111-1111-111111111111',
    });
    expect(result.slug).toBe('my-plugin');
  });

  it('rejects when Control Plane is not configured', async () => {
    const svc = new MarketplaceService(
      makeCatalog(catalogWith([])),
      makeRegistry({ loaded: [] }),
      makeCp({ isConfigured: () => false }),
      makeInstaller(),
      makeIdentity(),
      makeConfig(),
    );

    await expect(svc.submit({ slug: 'x', name: 'X', packageName: '@x/y' })).rejects.toThrow(
      BadRequestException,
    );
  });
});
