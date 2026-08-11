import { NotFoundException } from '@nestjs/common';
import { PluginRegistryService } from './plugin-registry.service';
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
    returning: () => chain,
    then(resolve: any) {
      return Promise.resolve(returnValue).then(resolve);
    },
  };
  return chain;
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
  describe('onModuleInit — nowy plugin', () => {
    it('wstawia rekord do DB gdy plugin nie istnieje', async () => {
      const insertValues = jest.fn(() => makeChain());
      const db: any = {
        select: jest.fn(() => ({
          from: () => ({ where: () => ({ limit: () => makeChain([]) }) }),
        })),
        insert: jest.fn(() => ({ values: insertValues })),
        update: jest.fn(() => makeChain()),
      };

      const plugin = makePlugin();
      const svc = makeService([plugin], db);
      await svc.onModuleInit();

      expect(db.insert).toHaveBeenCalled();
      expect(insertValues).toHaveBeenCalled();
    });

    it('wywołuje onInit jeśli plugin istnieje i jest enabled', async () => {
      const onInit = jest.fn().mockResolvedValue(undefined);
      const existingRow = {
        id: 'uuid-1',
        name: 'test_plugin',
        displayName: 'Test',
        version: '1.0.0',
        enabled: true,
        config: { WEBHOOK_URL: 'https://example.com' },
        installedAt: new Date(),
        updatedAt: new Date(),
        description: null,
      };

      const db: any = {
        select: jest.fn(() => ({
          from: () => ({ where: () => ({ limit: () => makeChain([existingRow]) }) }),
        })),
        insert: jest.fn(() => ({ values: jest.fn(() => makeChain()) })),
        update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(() => makeChain()) })) })),
      };

      const plugin = makePlugin({ onInit });
      const svc = makeService([plugin], db);
      await svc.onModuleInit();

      expect(onInit).toHaveBeenCalledWith(
        expect.objectContaining({ config: { WEBHOOK_URL: 'https://example.com' } }),
      );
    });

    it('calls onMigrate before onInit when plugin declares it', async () => {
      const order: string[] = [];
      const existingRow = {
        id: 'uuid-migrate',
        name: 'test_migrate',
        displayName: 'Test',
        version: '1.0.0',
        enabled: true,
        config: {},
        installedAt: new Date(),
        updatedAt: new Date(),
        description: null,
      };

      const db: any = {
        $client: { unsafe: jest.fn() },
        select: jest.fn(() => ({
          from: () => ({ where: () => ({ limit: () => makeChain([existingRow]) }) }),
        })),
        insert: jest.fn(() => ({ values: jest.fn(() => makeChain()) })),
        update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(() => makeChain()) })) })),
      };

      const plugin = makePlugin({
        name: 'test_migrate',
        onMigrate: jest.fn().mockImplementation(async () => {
          order.push('migrate');
        }),
        onInit: jest.fn().mockImplementation(async () => {
          order.push('init');
        }),
      });
      const svc = makeService([plugin], db);
      await svc.onModuleInit();

      expect(order).toEqual(['migrate', 'init']);
      expect(plugin.onMigrate).toHaveBeenCalledWith(db.$client);
    });

    it('skips onInit when onMigrate throws', async () => {
      const onInit = jest.fn().mockResolvedValue(undefined);
      const existingRow = {
        id: 'uuid-migrate-err',
        name: 'test_plugin',
        displayName: 'Test',
        version: '1.0.0',
        enabled: true,
        config: {},
        installedAt: new Date(),
        updatedAt: new Date(),
        description: null,
      };

      const db: any = {
        $client: { unsafe: jest.fn() },
        select: jest.fn(() => ({
          from: () => ({ where: () => ({ limit: () => makeChain([existingRow]) }) }),
        })),
        insert: jest.fn(() => ({ values: jest.fn(() => makeChain()) })),
        update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(() => makeChain()) })) })),
      };

      const plugin = makePlugin({
        onMigrate: jest.fn().mockRejectedValue(new Error('migration failed')),
        onInit,
      });
      const svc = makeService([plugin], db);
      await svc.onModuleInit();

      expect(onInit).not.toHaveBeenCalled();
    });

    it('NIE wywołuje onInit gdy plugin disabled', async () => {
      const onInit = jest.fn();
      const existingRow = {
        id: 'uuid-2',
        name: 'test_plugin',
        enabled: false,
        version: '1.0.0',
        config: {},
        installedAt: new Date(),
        updatedAt: new Date(),
        displayName: 'Test',
        description: null,
      };

      const db: any = {
        select: jest.fn(() => ({
          from: () => ({ where: () => ({ limit: () => makeChain([existingRow]) }) }),
        })),
        insert: jest.fn(() => ({ values: jest.fn(() => makeChain()) })),
        update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(() => makeChain()) })) })),
      };

      const plugin = makePlugin({ onInit });
      const svc = makeService([plugin], db);
      await svc.onModuleInit();

      expect(onInit).not.toHaveBeenCalled();
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
      const existingRow = {
        id: 'uuid-6',
        name: 'test_plugin',
        enabled: true,
        version: '1.0.0',
        config: {},
        installedAt: new Date(),
        updatedAt: new Date(),
        displayName: 'Test',
        description: null,
      };

      const db: any = {
        select: jest.fn(() => ({
          from: () => ({ where: () => ({ limit: () => makeChain([existingRow]) }) }),
        })),
        insert: jest.fn(() => ({ values: jest.fn(() => makeChain()) })),
        update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(() => makeChain()) })) })),
      };

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
      const db: any = {
        select: jest.fn(() => ({
          from: () => ({ where: () => ({ limit: () => makeChain([]) }) }),
        })),
        insert: jest.fn(() => ({ values: jest.fn(() => makeChain()) })),
      };

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
