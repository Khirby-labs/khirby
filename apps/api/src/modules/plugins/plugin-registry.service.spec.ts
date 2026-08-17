import { NotFoundException } from '@nestjs/common';
import { PluginRegistryService, NATIVE_PLUGIN_NAMES } from './plugin-registry.service';
import { CrmPlugin, CrmEvent } from '@khirby/plugin-sdk';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeChain(returnValue: unknown = []) {
  const chain: any = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    insert: () => chain,
    values: () => chain,
    update: () => chain,
    set: () => chain,
    delete: () => chain,
    onConflictDoNothing: () => chain,
    returning: () => chain,
    then(resolve: any) {
      return Promise.resolve(returnValue).then(resolve);
    },
  };
  return chain;
}

/**
 * Root db mock for the boot path. Deliberately NOT built from makeChain: the
 * root object must have no `.then`, or NestJS DI injects `[]` instead of the
 * mock (AGENTS.md, INCIDENTS 2026-07-24).
 *
 * Two reads are distinguished, because boot and findByName differ by exactly one
 * link: `select().from()` awaited directly is the whole-table read that decides
 * whether this is a first boot; `select().from().where().limit()` is one name.
 *
 * @param table  rows the whole-table read yields
 * @param lookup rows a single-name read yields (defaults to `table`)
 */
function makeBootDb(options: { table?: unknown[]; lookup?: unknown[]; inserted?: unknown[] } = {}) {
  const table = options.table ?? [];
  const lookup = options.lookup ?? table;

  const insertValues = jest.fn(() => ({
    onConflictDoNothing: () => ({ returning: () => makeChain(options.inserted ?? []) }),
  }));
  const updateSet = jest.fn(() => ({ where: jest.fn(() => makeChain()) }));

  const db: any = {
    $client: { unsafe: jest.fn() },
    select: jest.fn(() => ({
      from: () => {
        const scoped: any = makeChain(table);
        scoped.where = () => ({ limit: () => makeChain(lookup) });
        return scoped;
      },
    })),
    insert: jest.fn(() => ({ values: insertValues })),
    update: jest.fn(() => ({ set: updateSet })),
    delete: jest.fn(() => ({ where: jest.fn(() => makeChain()) })),
  };

  return { db, insertValues, updateSet };
}

/** A stored row, with only the fields the registry actually reads set. */
function makeRow(partial: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    name: 'test_plugin',
    displayName: 'Test Plugin',
    description: null,
    version: '1.0.0',
    enabled: true,
    config: {},
    installedAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

function makePlugin(partial: Partial<CrmPlugin> = {}): CrmPlugin {
  return {
    name: 'test_plugin',
    displayName: 'Test Plugin',
    version: '1.0.0',
    ...partial,
  };
}

function makeService(plugins: CrmPlugin[], db: any): PluginRegistryService {
  const svc = new (PluginRegistryService as any)(db, plugins);
  return svc;
}

// ─── testy ────────────────────────────────────────────────────────────────────

describe('PluginRegistryService', () => {
  /*
   * Boot has two shapes now, and the old suite asserted the opposite of both: it
   * required db.insert to be called for a plugin with no row. After ADR-0032 a
   * row IS the installation, so an absent row means "available" and boot must
   * write nothing. The assertion is inverted here rather than deleted, because
   * losing it would leave the whole unconditional-install regression uncovered.
   */
  describe('onModuleInit — first boot (empty plugins table)', () => {
    const nativePlugins = () =>
      NATIVE_PLUGIN_NAMES.map((name) => makePlugin({ name, displayName: name, version: '1.0.0' }));

    it('seeds one row per native plugin, enabled', async () => {
      const { db, insertValues } = makeBootDb({
        table: [],
        inserted: [makeRow({ name: 'seeded' })],
      });

      const svc = makeService(nativePlugins(), db);
      await svc.onModuleInit();

      expect(insertValues).toHaveBeenCalledTimes(NATIVE_PLUGIN_NAMES.length);
      const seededNames = insertValues.mock.calls.map((call: any[]) => call[0].name);
      expect(seededNames.sort()).toEqual([...NATIVE_PLUGIN_NAMES].sort());
      for (const call of insertValues.mock.calls) {
        expect((call as any[])[0].enabled).toBe(true);
      }
    });

    it('does not seed a plugin the image does not ship', async () => {
      const { db, insertValues } = makeBootDb({
        table: [],
        inserted: [makeRow({ name: 'crm_webhook' })],
      });

      // Only one of the six native names is present in this process.
      const svc = makeService([makePlugin({ name: 'crm_webhook' })], db);
      await svc.onModuleInit();

      expect(insertValues).toHaveBeenCalledTimes(1);
      expect((insertValues.mock.calls[0] as any[])[0].name).toBe('crm_webhook');
    });

    /*
     * The concurrency trap this exists to prevent: docker-stack.yml deploys with
     * order: start-first, so two processes overlap and both see an empty table.
     * `plugins.name` is unique, so the loser's insert is a no-op returning no
     * row. Adopting the winner's row is not cosmetic — without it this process
     * has no context, and emit() skips context-less plugins, so every event in
     * the replica would be dropped in silence.
     */
    it('adopts the winner row and still builds a context when the seed insert conflicts', async () => {
      const adopted = makeRow({ name: 'crm_webhook', enabled: true, config: { A: '1' } });
      const onInit = jest.fn().mockResolvedValue(undefined);
      const { db } = makeBootDb({ table: [], inserted: [], lookup: [adopted] });

      const svc = makeService([makePlugin({ name: 'crm_webhook', onInit })], db);
      await svc.onModuleInit();

      expect(onInit).toHaveBeenCalledWith(expect.objectContaining({ config: { A: '1' } }));
      expect(svc.isEnabled('crm_webhook')).toBe(true);
    });

    it('runs onMigrate before onInit while seeding', async () => {
      const order: string[] = [];
      const { db } = makeBootDb({
        table: [],
        inserted: [makeRow({ name: 'crm_webhook' })],
      });

      const plugin = makePlugin({
        name: 'crm_webhook',
        onMigrate: jest.fn().mockImplementation(async () => void order.push('migrate')),
        onInit: jest.fn().mockImplementation(async () => void order.push('init')),
      });
      const svc = makeService([plugin], db);
      await svc.onModuleInit();

      expect(order).toEqual(['migrate', 'init']);
      expect(plugin.onMigrate).toHaveBeenCalledWith(db.$client);
    });

    it('a plugin whose onInit throws does not stop the rest of the boot', async () => {
      const healthy = jest.fn().mockResolvedValue(undefined);
      const { db } = makeBootDb({ table: [], inserted: [makeRow()] });

      const svc = makeService(
        [
          makePlugin({ name: 'crm_webhook', onInit: jest.fn().mockRejectedValue(new Error('x')) }),
          makePlugin({ name: 'crm_discord', onInit: healthy }),
        ],
        db,
      );

      await expect(svc.onModuleInit()).resolves.toBeUndefined();
      expect(healthy).toHaveBeenCalled();
    });
  });

  describe('onModuleInit — subsequent boot (table not empty)', () => {
    it('installs nothing, even for a plugin with no row', async () => {
      const { db, insertValues } = makeBootDb({ table: [makeRow({ name: 'crm_webhook' })] });

      const svc = makeService(
        [makePlugin({ name: 'crm_webhook' }), makePlugin({ name: 'crm_not_installed' })],
        db,
      );
      await svc.onModuleInit();

      expect(db.insert).not.toHaveBeenCalled();
      expect(insertValues).not.toHaveBeenCalled();
    });

    it('leaves an uninstalled plugin without a context, so PluginEnabledGuard closes its routes', async () => {
      const onInit = jest.fn();
      const { db } = makeBootDb({ table: [makeRow({ name: 'crm_webhook' })] });

      const svc = makeService(
        [makePlugin({ name: 'crm_webhook' }), makePlugin({ name: 'crm_not_installed', onInit })],
        db,
      );
      await svc.onModuleInit();

      expect(onInit).not.toHaveBeenCalled();
      expect(svc.isEnabled('crm_not_installed')).toBe(false);
    });

    it('wywołuje onInit jeśli plugin istnieje i jest enabled', async () => {
      const onInit = jest.fn().mockResolvedValue(undefined);
      const { db } = makeBootDb({
        table: [makeRow({ config: { WEBHOOK_URL: 'https://example.com' } })],
      });

      const svc = makeService([makePlugin({ onInit })], db);
      await svc.onModuleInit();

      expect(onInit).toHaveBeenCalledWith(
        expect.objectContaining({ config: { WEBHOOK_URL: 'https://example.com' } }),
      );
    });

    it('calls onMigrate before onInit when plugin declares it', async () => {
      const order: string[] = [];
      const { db } = makeBootDb({ table: [makeRow({ name: 'test_migrate' })] });

      const plugin = makePlugin({
        name: 'test_migrate',
        onMigrate: jest.fn().mockImplementation(async () => void order.push('migrate')),
        onInit: jest.fn().mockImplementation(async () => void order.push('init')),
      });
      const svc = makeService([plugin], db);
      await svc.onModuleInit();

      expect(order).toEqual(['migrate', 'init']);
      expect(plugin.onMigrate).toHaveBeenCalledWith(db.$client);
    });

    it('skips onInit when onMigrate throws', async () => {
      const onInit = jest.fn().mockResolvedValue(undefined);
      const { db } = makeBootDb({ table: [makeRow()] });

      const svc = makeService(
        [
          makePlugin({
            onMigrate: jest.fn().mockRejectedValue(new Error('migration failed')),
            onInit,
          }),
        ],
        db,
      );
      await svc.onModuleInit();

      expect(onInit).not.toHaveBeenCalled();
    });

    it('NIE wywołuje onInit gdy plugin disabled', async () => {
      const onInit = jest.fn();
      const { db } = makeBootDb({ table: [makeRow({ enabled: false })] });

      const svc = makeService([makePlugin({ onInit })], db);
      await svc.onModuleInit();

      expect(onInit).not.toHaveBeenCalled();
    });

    /*
     * onMigrate must run for a DISABLED row too: the plugin's tables have to
     * exist before an operator later switches it on. The pre-Marketplace code
     * did this (it migrated before the enabled check) but nothing asserted it,
     * so splitting registerPlugin into activate() could have dropped it in
     * silence.
     */
    it('still runs onMigrate for an installed but disabled plugin', async () => {
      const onMigrate = jest.fn().mockResolvedValue(undefined);
      const onInit = jest.fn();
      const { db } = makeBootDb({ table: [makeRow({ enabled: false })] });

      const svc = makeService([makePlugin({ onMigrate, onInit })], db);
      await svc.onModuleInit();

      expect(onMigrate).toHaveBeenCalledWith(db.$client);
      expect(onInit).not.toHaveBeenCalled();
      expect(svc.isEnabled('test_plugin')).toBe(false);
    });

    it('updates a stored version that no longer matches the image', async () => {
      const { db, updateSet } = makeBootDb({ table: [makeRow({ version: '1.0.0' })] });

      const svc = makeService([makePlugin({ version: '2.1.0' })], db);
      await svc.onModuleInit();

      expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ version: '2.1.0' }));
    });

    it('does not touch a row whose version already matches', async () => {
      const { db, updateSet } = makeBootDb({ table: [makeRow({ version: '1.0.0' })] });

      const svc = makeService([makePlugin({ version: '1.0.0' })], db);
      await svc.onModuleInit();

      expect(updateSet).not.toHaveBeenCalled();
    });

    it('ignores an orphan row for a plugin no longer in the image', async () => {
      const { db } = makeBootDb({ table: [makeRow({ name: 'crm_removed' })] });

      const svc = makeService([], db);
      await expect(svc.onModuleInit()).resolves.toBeUndefined();
    });
  });

  describe('listAvailable', () => {
    it('returns every plugin in the process that has no row, with its localizable fields', async () => {
      const { db } = makeBootDb({ table: [makeRow({ name: 'crm_installed' })] });

      const svc = makeService(
        [
          makePlugin({ name: 'crm_installed' }),
          makePlugin({
            name: 'crm_available',
            displayName: 'Available One',
            displayNameKey: 'plugins.available.displayName',
            description: 'Does a thing',
            descriptionKey: 'plugins.available.description',
            version: '3.0.0',
            getConfigSchema: () => [{ key: 'TOKEN', label: 'Token', type: 'text', required: true }],
          }),
        ],
        db,
      );

      expect(await svc.listAvailable()).toEqual([
        {
          name: 'crm_available',
          displayName: 'Available One',
          displayNameKey: 'plugins.available.displayName',
          description: 'Does a thing',
          descriptionKey: 'plugins.available.description',
          version: '3.0.0',
          configSchema: [{ key: 'TOKEN', label: 'Token', type: 'text', required: true }],
        },
      ]);
    });

    it('is empty when every plugin in the process is installed', async () => {
      const { db } = makeBootDb({ table: [makeRow({ name: 'crm_installed' })] });
      const svc = makeService([makePlugin({ name: 'crm_installed' })], db);

      expect(await svc.listAvailable()).toEqual([]);
    });

    it('reports a null description and an empty schema for a plugin declaring neither', async () => {
      const { db } = makeBootDb({ table: [] });
      const svc = makeService([makePlugin({ name: 'crm_bare' })], db);

      expect(await svc.listAvailable()).toEqual([
        {
          name: 'crm_bare',
          displayName: 'Test Plugin',
          displayNameKey: undefined,
          description: null,
          descriptionKey: undefined,
          version: '1.0.0',
          configSchema: [],
        },
      ]);
    });
  });

  describe('findAll', () => {
    it('zwraca wynik z DB z frontendRoutes', async () => {
      const rows = [{ id: 'uuid-3', name: 'p1' }];
      const chain = makeChain(rows);
      const db: any = { select: jest.fn(() => ({ from: () => chain })) };

      const svc = makeService([], db);
      const result = await svc.findAll();

      expect(result).toEqual([{ id: 'uuid-3', name: 'p1', frontendRoutes: [], configSchema: [] }]);
    });
  });

  describe('findByName', () => {
    it('zwraca plugin gdy istnieje', async () => {
      const row = { id: 'uuid-4', name: 'test_plugin', enabled: true };
      const db: any = {
        select: jest.fn(() => ({
          from: () => ({ where: () => ({ limit: () => makeChain([row]) }) }),
        })),
      };

      const svc = makeService([], db);
      const result = await svc.findByName('test_plugin');
      expect(result).toEqual(row);
    });

    it('zwraca null gdy nie istnieje', async () => {
      const db: any = {
        select: jest.fn(() => ({
          from: () => ({ where: () => ({ limit: () => makeChain([]) }) }),
        })),
      };

      const svc = makeService([], db);
      const result = await svc.findByName('nie_ma');
      expect(result).toBeNull();
    });
  });

  describe('disable', () => {
    it('rzuca NotFoundException gdy plugin nie istnieje w DB', async () => {
      const db: any = {
        select: jest.fn(() => ({
          from: () => ({ where: () => ({ limit: () => makeChain([]) }) }),
        })),
      };

      const svc = makeService([], db);
      await expect(svc.disable('nie_ma')).rejects.toThrow(NotFoundException);
    });

    it('ustawia enabled=false i usuwa context', async () => {
      const row = { id: 'uuid-5', name: 'test_plugin', enabled: true, config: {} };
      const updatedRow = { ...row, enabled: false };
      const setMock = jest.fn(() => ({
        where: jest.fn(() => ({ returning: jest.fn(() => makeChain([updatedRow])) })),
      }));

      const db: any = {
        select: jest.fn(() => ({
          from: () => ({ where: () => ({ limit: () => makeChain([row]) }) }),
        })),
        update: jest.fn(() => ({ set: setMock })),
      };

      const svc = makeService([], db);
      const result = await svc.disable('test_plugin');
      expect(result.enabled).toBe(false);
      expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    });
  });

  describe('emit', () => {
    it('wywołuje onEvent na wszystkich aktywnych pluginach', async () => {
      const onEvent = jest.fn().mockResolvedValue(undefined);
      const { db } = makeBootDb({ table: [makeRow()] });

      const plugin = makePlugin({ onEvent });
      const svc = makeService([plugin], db);
      await svc.onModuleInit(); // init context

      const event: CrmEvent = {
        type: 'contact.created',
        payload: { id: 'c1', email: 'x@x.pl', createdAt: new Date() },
      };
      await svc.emit(event);

      expect(onEvent).toHaveBeenCalledWith(event, expect.any(Object));
    });

    it('ignoruje plugin bez onEvent', async () => {
      const plugin = makePlugin(); // brak onEvent
      const { db } = makeBootDb({ table: [makeRow()] });

      const svc = makeService([plugin], db);
      await svc.onModuleInit();

      // nie rzuca błędu
      const ev: CrmEvent = {
        type: 'form.submitted',
        payload: {
          submissionId: 'x',
          formId: 'f',
          formSlug: 's',
          formName: 'Form',
          contactId: 'c',
          contactEmail: 'x@x.pl',
          data: {},
          createdAt: new Date(),
        },
      };
      await expect(svc.emit(ev)).resolves.toBeUndefined();
    });
  });

  describe('updateConfig', () => {
    it('rzuca NotFoundException gdy plugin nie ma rekordu', async () => {
      const db: any = {
        select: jest.fn(() => ({
          from: () => ({ where: () => ({ limit: () => makeChain([]) }) }),
        })),
      };
      const svc = makeService([], db);
      await expect(svc.updateConfig('nie_ma', {})).rejects.toThrow(NotFoundException);
    });

    it('aktualizuje config w DB', async () => {
      const row = { id: 'uuid-7', name: 'test_plugin', enabled: true, config: {} };
      const newConfig = { WEBHOOK_URL: 'https://new.url' };
      const updatedRow = { ...row, config: newConfig };
      const setMock = jest.fn(() => ({
        where: jest.fn(() => ({ returning: jest.fn(() => makeChain([updatedRow])) })),
      }));

      const db: any = {
        select: jest.fn(() => ({
          from: () => ({ where: () => ({ limit: () => makeChain([row]) }) }),
        })),
        update: jest.fn(() => ({ set: setMock })),
      };

      const svc = makeService([], db);
      const result = await svc.updateConfig('test_plugin', newConfig);
      expect(result.config).toEqual(newConfig);
      expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ config: newConfig }));
    });
  });
});
