import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PipelineStagesService } from './pipeline-stages.service';
import { DB_TOKEN } from '../../core/database/database.module';

function makeChain(result: any[] = []) {
  const chain: any = {};
  ['from', 'where', 'limit', 'offset', 'values', 'set', 'returning', 'orderBy'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return chain;
}

function buildDb() {
  const db: any = {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  db.select.mockImplementation(() => makeChain([]));
  db.insert.mockImplementation(() => makeChain([]));
  db.update.mockImplementation(() => makeChain([]));
  db.delete.mockImplementation(() => makeChain([]));
  return db;
}

describe('PipelineStagesService', () => {
  let service: PipelineStagesService;
  let module: TestingModule;
  let db: ReturnType<typeof buildDb>;

  beforeEach(async () => {
    db = buildDb();

    module = await Test.createTestingModule({
      providers: [PipelineStagesService, { provide: DB_TOKEN, useValue: db }],
    }).compile();

    service = module.get(PipelineStagesService);
  });

  afterEach(async () => {
    await module?.close();
  });

  describe('ensureDefaults', () => {
    beforeEach(() => {
      db.transaction = jest.fn(async (fn: (tx: typeof db) => Promise<void>) => fn(db));
      db.execute = jest.fn().mockResolvedValue([]);
    });

    it('seeds stages when table is empty', async () => {
      db.select.mockImplementationOnce(() => makeChain([{ count: 0 }]));
      db.insert.mockImplementationOnce(() => makeChain([]));
      db.select.mockImplementationOnce(() => makeChain([]));

      await service.ensureDefaults();

      expect(db.insert).toHaveBeenCalled();
    });

    it('skips seed when stages exist', async () => {
      db.select
        .mockImplementationOnce(() => makeChain([{ count: 5 }]))
        .mockImplementationOnce(() => makeChain([{ id: 's1', position: 0 }]));

      await service.ensureDefaults();

      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('migrates leads to first stage before delete', async () => {
      const stage = { id: 's2', name: 'Meeting', position: 1 };
      const first = { id: 's1', name: 'New Lead', position: 0 };

      db.select
        .mockImplementationOnce(() => makeChain([stage]))
        .mockImplementationOnce(() => makeChain([first]));

      db.update.mockImplementationOnce(() => makeChain([]));
      db.delete.mockImplementationOnce(() => makeChain([]));

      await service.delete('s2');

      expect(db.update).toHaveBeenCalled();
      expect(db.delete).toHaveBeenCalled();
    });

    it('throws when deleting first stage', async () => {
      const stage = { id: 's1', name: 'New Lead', position: 0 };

      db.select
        .mockImplementationOnce(() => makeChain([stage]))
        .mockImplementationOnce(() => makeChain([stage]));

      await expect(service.delete('s1')).rejects.toThrow(BadRequestException);
    });

    it('throws when stage not found', async () => {
      db.select.mockImplementationOnce(() => makeChain([]));

      await expect(service.delete('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reorder', () => {
    it('throws when stageIds count mismatch', async () => {
      db.select.mockImplementationOnce(() => makeChain([{ id: 's1' }, { id: 's2' }]));

      await expect(service.reorder(['s1'])).rejects.toThrow(BadRequestException);
    });
  });
});
