import { ConflictException, NotFoundException } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { CATALOG_FORMAT_VERSION, CatalogDocument } from './catalog';

/**
 * Resolution is pure orchestration over the catalog document and the registry, so
 * both are supplied as plain stubs. What is being measured is the merge: which
 * cards exist, what status each carries, and where the metadata comes from.
 */

function makeCatalog(document: CatalogDocument) {
  return { load: jest.fn().mockResolvedValue(document) } as any;
}

function catalogWith(names: string[]): CatalogDocument {
  return {
    version: CATALOG_FORMAT_VERSION,
    entries: names.map((name) => ({
      package: `@khirby/plugin-${name}`,
      name,
      version: '1.0.0',
      category: 'automation' as const,
      vendor: 'Khirby',
      icon: 'plugins' as const,
      docsUrl: `https://khirby.com/docs/plugins/${name}`,
    })),
  };
}

function makeRegistry(options: {
  loaded: string[];
  installed?: Array<Record<string, unknown>>;
  available?: Array<Record<string, unknown>>;
  install?: jest.Mock;
}) {
  return {
    loadedNames: () => options.loaded,
    // One snapshot call, mirroring the single table read the service depends on.
    snapshot: jest.fn().mockResolvedValue({
      installed: options.installed ?? [],
      available: options.available ?? [],
    }),
    install: options.install ?? jest.fn().mockResolvedValue({ name: 'x' }),
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

function availablePlugin(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    displayName: name,
    description: null,
    version: '1.0.0',
    configSchema: [],
    ...overrides,
  };
}

describe('MarketplaceService.list', () => {
  it('marks a plugin with a row installed and one without available', async () => {
    const svc = new MarketplaceService(
      makeCatalog(catalogWith(['crm_a', 'crm_b'])),
      makeRegistry({
        loaded: ['crm_a', 'crm_b'],
        installed: [installedRow('crm_a')],
        available: [availablePlugin('crm_b')],
      }),
    );

    const cards = await svc.list();
    expect(cards.map((c) => [c.name, c.status, c.enabled])).toEqual([
      ['crm_a', 'installed', true],
      ['crm_b', 'available', false],
    ]);
  });

  it('reports an installed but disabled plugin as installed with enabled false', async () => {
    const svc = new MarketplaceService(
      makeCatalog(catalogWith(['crm_a'])),
      makeRegistry({
        loaded: ['crm_a'],
        installed: [installedRow('crm_a', { enabled: false })],
      }),
    );

    const [card] = await svc.list();
    expect(card.status).toBe('installed');
    expect(card.enabled).toBe(false);
  });

  it('carries the catalog metadata onto the card', async () => {
    const svc = new MarketplaceService(
      makeCatalog(catalogWith(['crm_a'])),
      makeRegistry({ loaded: ['crm_a'], available: [availablePlugin('crm_a')] }),
    );

    const [card] = await svc.list();
    expect(card).toEqual(
      expect.objectContaining({
        category: 'automation',
        vendor: 'Khirby',
        icon: 'plugins',
        docsUrl: 'https://khirby.com/docs/plugins/crm_a',
      }),
    );
  });

  it('passes the plugin message keys through so the SPA can localize the card', async () => {
    const svc = new MarketplaceService(
      makeCatalog(catalogWith(['crm_a'])),
      makeRegistry({
        loaded: ['crm_a'],
        available: [
          availablePlugin('crm_a', {
            displayNameKey: 'plugins.a.displayName',
            descriptionKey: 'plugins.a.description',
            description: 'English literal',
          }),
        ],
      }),
    );

    const [card] = await svc.list();
    expect(card.displayNameKey).toBe('plugins.a.displayName');
    expect(card.descriptionKey).toBe('plugins.a.description');
    expect(card.description).toBe('English literal');
  });

  it('hides a catalog entry naming a plugin this image does not ship', async () => {
    const svc = new MarketplaceService(
      makeCatalog(catalogWith(['crm_a', 'crm_ghost'])),
      makeRegistry({ loaded: ['crm_a'], available: [availablePlugin('crm_a')] }),
    );

    expect((await svc.list()).map((c) => c.name)).toEqual(['crm_a']);
  });

  /*
   * The union half. Plain (catalog ∩ process) would make six installed cards
   * disappear the moment a remote catalog omitted them — which reads as data loss,
   * not as a filter.
   */
  it('keeps an installed plugin whose catalog entry is missing, under the other category', async () => {
    const svc = new MarketplaceService(
      makeCatalog(catalogWith([])),
      makeRegistry({ loaded: ['crm_a'], installed: [installedRow('crm_a')] }),
    );

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

  it('does not offer an uninstalled plugin the catalog says nothing about', async () => {
    const svc = new MarketplaceService(
      makeCatalog(catalogWith([])),
      makeRegistry({ loaded: ['crm_a'], available: [availablePlugin('crm_a')] }),
    );

    expect(await svc.list()).toEqual([]);
  });

  it('skips an orphan row whose plugin left the image', async () => {
    const svc = new MarketplaceService(
      makeCatalog(catalogWith(['crm_a'])),
      makeRegistry({
        loaded: ['crm_a'],
        installed: [installedRow('crm_a'), installedRow('crm_removed')],
      }),
    );

    expect((await svc.list()).map((c) => c.name)).toEqual(['crm_a']);
  });

  it('returns an empty list rather than an error when nothing survives the filter', async () => {
    const svc = new MarketplaceService(
      makeCatalog(catalogWith(['crm_ghost'])),
      makeRegistry({ loaded: [] }),
    );

    await expect(svc.list()).resolves.toEqual([]);
  });

  /*
   * The regression that would only ever show up in production: if the fifteen-minute
   * cache held the enriched RESPONSE instead of the catalog document, a plugin
   * installed at T would keep reading `available` for the rest of the window. Every
   * spec would stay green, because a spec never waits fifteen minutes.
   *
   * Here the catalog stub is called twice and returns the same document; only the
   * registry's answer changes, exactly as it would after a real install.
   */
  /*
   * Installed and available are derived from ONE read of the table. Asking for
   * them separately let an install() commit between the two queries, after which
   * the same plugin was installed according to one answer and available according
   * to the other — the Marketplace then rendered two cards for one name, one of
   * them still offering Install.
   */
  it('takes both lists from a single registry snapshot', async () => {
    const registry = makeRegistry({
      loaded: ['crm_a'],
      installed: [installedRow('crm_a')],
    });
    const svc = new MarketplaceService(makeCatalog(catalogWith(['crm_a'])), registry);

    await svc.list();

    expect(registry.snapshot).toHaveBeenCalledTimes(1);
  });

  it('never lists the same plugin twice', async () => {
    const svc = new MarketplaceService(
      makeCatalog(catalogWith(['crm_a', 'crm_b'])),
      makeRegistry({
        loaded: ['crm_a', 'crm_b'],
        installed: [installedRow('crm_a')],
        available: [availablePlugin('crm_b')],
      }),
    );

    const names = (await svc.list()).map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('reflects an install immediately, even though the catalog document is cached', async () => {
    const catalog = makeCatalog(catalogWith(['crm_a']));
    const registry = makeRegistry({ loaded: ['crm_a'], available: [availablePlugin('crm_a')] });
    const svc = new MarketplaceService(catalog, registry);

    expect((await svc.list())[0].status).toBe('available');

    // The install happened; the catalog document did not change.
    registry.snapshot.mockResolvedValue({
      installed: [installedRow('crm_a')],
      available: [],
    });

    expect((await svc.list())[0].status).toBe('installed');
    expect(catalog.load).toHaveBeenCalledTimes(2);
  });
});

describe('MarketplaceService.findOne', () => {
  it('returns the card for a name in the catalog', async () => {
    const svc = new MarketplaceService(
      makeCatalog(catalogWith(['crm_a'])),
      makeRegistry({ loaded: ['crm_a'], available: [availablePlugin('crm_a')] }),
    );

    expect((await svc.findOne('crm_a')).name).toBe('crm_a');
  });

  it('rejects a name outside the catalog', async () => {
    const svc = new MarketplaceService(
      makeCatalog(catalogWith(['crm_a'])),
      makeRegistry({ loaded: ['crm_a'], available: [availablePlugin('crm_a')] }),
    );

    await expect(svc.findOne('crm_nope')).rejects.toThrow(NotFoundException);
  });
});

describe('MarketplaceService.install', () => {
  it('delegates to the registry for a plugin the catalog offers', async () => {
    const install = jest.fn().mockResolvedValue({ name: 'crm_a', enabled: true });
    const svc = new MarketplaceService(
      makeCatalog(catalogWith(['crm_a'])),
      makeRegistry({ loaded: ['crm_a'], install }),
    );

    await svc.install('crm_a');
    // By the plugin's crm_* name, never the catalog's `package` field.
    expect(install).toHaveBeenCalledWith('crm_a');
  });

  it('refuses a name the catalog does not list, without asking the registry', async () => {
    const install = jest.fn();
    const svc = new MarketplaceService(
      makeCatalog(catalogWith(['crm_a'])),
      makeRegistry({ loaded: ['crm_a'], install }),
    );

    await expect(svc.install('crm_nope')).rejects.toThrow(NotFoundException);
    expect(install).not.toHaveBeenCalled();
  });

  it('lets the registry conflict surface for an already-installed plugin', async () => {
    const install = jest.fn().mockRejectedValue(new ConflictException('already'));
    const svc = new MarketplaceService(
      makeCatalog(catalogWith(['crm_a'])),
      makeRegistry({ loaded: ['crm_a'], install }),
    );

    await expect(svc.install('crm_a')).rejects.toThrow(ConflictException);
  });
});
