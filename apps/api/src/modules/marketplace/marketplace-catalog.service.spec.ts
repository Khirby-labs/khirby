import {
  CATALOG_CACHE_TTL_MS,
  CATALOG_FAILURE_TTL_MS,
  MarketplaceCatalogService,
} from './marketplace-catalog.service';
import { CATALOG_FORMAT_VERSION, LOCAL_CATALOG } from './catalog';

function makeConfig(values: Record<string, string | undefined> = {}) {
  return {
    get: jest.fn((key: string, fallback?: string) =>
      key in values ? (values[key] ?? fallback) : fallback,
    ),
  } as any;
}

function makeCp(
  overrides: {
    configured?: boolean;
    listPlugins?: jest.Mock;
  } = {},
) {
  return {
    isConfigured: () => overrides.configured ?? true,
    listPlugins: overrides.listPlugins ?? jest.fn().mockResolvedValue([]),
  } as any;
}

function cpPlugin(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'webhook',
    name: 'Webhook',
    description: 'Sends webhooks',
    packageName: '@khirby/plugin-webhook',
    publisherName: 'Khirby',
    verified: true,
    repositoryUrl: 'https://github.com/khirby/plugin-webhook',
    latestVersion: '1.2.0',
    permissions: ['contacts:read'],
    compatible: true,
    ...overrides,
  };
}

describe('MarketplaceCatalogService — no Control Plane', () => {
  it('uses the empty catalog without calling the client', async () => {
    const listPlugins = jest.fn();
    const svc = new MarketplaceCatalogService(
      makeConfig({ APP_VERSION: '1.0.0' }),
      makeCp({ configured: false, listPlugins }),
    );
    await expect(svc.load()).resolves.toEqual(LOCAL_CATALOG);
    expect(listPlugins).not.toHaveBeenCalled();
  });
});

describe('MarketplaceCatalogService — Control Plane feed', () => {
  it('maps CP plugins into catalog entries and sorts verified first', async () => {
    const listPlugins = jest.fn().mockResolvedValue([
      cpPlugin({ slug: 'zeta', name: 'Zeta', verified: false, packageName: '@khirby/plugin-zeta' }),
      cpPlugin({
        slug: 'alpha',
        name: 'Alpha',
        verified: true,
        packageName: '@khirby/plugin-alpha',
      }),
      cpPlugin({
        slug: 'beta',
        name: 'Beta',
        verified: true,
        packageName: '@khirby/plugin-beta',
      }),
    ]);
    const svc = new MarketplaceCatalogService(
      makeConfig({ APP_VERSION: '1.0.0' }),
      makeCp({ listPlugins }),
    );

    const doc = await svc.load();
    expect(listPlugins).toHaveBeenCalledWith({ compatibleWith: '1.0.0' });
    expect(doc.version).toBe(CATALOG_FORMAT_VERSION);
    expect(doc.entries.map((e) => e.slug)).toEqual(['alpha', 'beta', 'zeta']);
    expect(doc.entries[0]).toEqual(
      expect.objectContaining({
        slug: 'alpha',
        name: 'crm_alpha',
        packageName: '@khirby/plugin-alpha',
        displayName: 'Alpha',
        verified: true,
        compatible: true,
        permissions: ['contacts:read'],
        latestVersion: '1.2.0',
        vendor: 'Khirby',
        category: 'other',
        icon: 'plugins',
      }),
    );
  });

  it('passes search through and omits non-semver APP_VERSION from compatibleWith', async () => {
    const listPlugins = jest.fn().mockResolvedValue([]);
    const svc = new MarketplaceCatalogService(
      makeConfig({ APP_VERSION: 'dev' }),
      makeCp({ listPlugins }),
    );
    await svc.load('mail');
    expect(listPlugins).toHaveBeenCalledWith({ search: 'mail' });
  });

  it('falls back to the empty catalog when the client returns null', async () => {
    const listPlugins = jest.fn().mockResolvedValue(null);
    const svc = new MarketplaceCatalogService(makeConfig(), makeCp({ listPlugins }));
    await expect(svc.load()).resolves.toEqual(LOCAL_CATALOG);
  });

  it('treats missing compatible as true', async () => {
    const listPlugins = jest
      .fn()
      .mockResolvedValue([cpPlugin({ compatible: undefined, packageName: '@khirby/plugin-x' })]);
    const doc = await new MarketplaceCatalogService(makeConfig(), makeCp({ listPlugins })).load();
    expect(doc.entries[0].compatible).toBe(true);
  });

  it('nulls a non-https repositoryUrl', async () => {
    const listPlugins = jest
      .fn()
      .mockResolvedValue([cpPlugin({ repositoryUrl: 'http://example.com/repo' })]);
    const doc = await new MarketplaceCatalogService(makeConfig(), makeCp({ listPlugins })).load();
    expect(doc.entries[0].docsUrl).toBeNull();
  });
});

describe('MarketplaceCatalogService — caching', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reuses a successful document inside the success window', async () => {
    const listPlugins = jest.fn().mockResolvedValue([cpPlugin()]);
    const svc = new MarketplaceCatalogService(makeConfig(), makeCp({ listPlugins }));

    await svc.load();
    await svc.load();
    await svc.load();
    expect(listPlugins).toHaveBeenCalledTimes(1);

    (Date.now as jest.Mock).mockReturnValue(1_000_000 + CATALOG_CACHE_TTL_MS + 1);
    await svc.load();
    expect(listPlugins).toHaveBeenCalledTimes(2);
  });

  it('does not retry a failed remote inside the failure window', async () => {
    const listPlugins = jest.fn().mockResolvedValue(null);
    const svc = new MarketplaceCatalogService(makeConfig(), makeCp({ listPlugins }));

    await svc.load();
    await svc.load();
    expect(listPlugins).toHaveBeenCalledTimes(1);

    (Date.now as jest.Mock).mockReturnValue(1_000_000 + CATALOG_FAILURE_TTL_MS + 1);
    listPlugins.mockResolvedValue([cpPlugin()]);
    const doc = await svc.load();
    expect(listPlugins).toHaveBeenCalledTimes(2);
    expect(doc.entries).toHaveLength(1);
  });
});
