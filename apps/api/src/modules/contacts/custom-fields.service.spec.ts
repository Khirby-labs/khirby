import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CustomFieldsService, slugifyFieldName } from './custom-fields.service';
import { DB_TOKEN } from '../../core/database/database.module';

function makeChain(result: any[] = []) {
  const chain: any = {};
  const _result = result;

  ['from', 'where', 'limit', 'offset', 'values', 'set', 'returning', 'orderBy'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });

  chain.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(_result).then(onFulfilled, onRejected);

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

describe('slugifyFieldName', () => {
  it('normalizes operator names to slugs', () => {
    expect(slugifyFieldName('MRR')).toBe('mrr');
    expect(slugifyFieldName('NIP firmy')).toBe('nip-firmy');
  });
});

describe('CustomFieldsService', () => {
  let service: CustomFieldsService;
  let module: TestingModule;
  let db: ReturnType<typeof buildDb>;

  beforeEach(async () => {
    db = buildDb();
    module = await Test.createTestingModule({
      providers: [CustomFieldsService, { provide: DB_TOKEN, useValue: db }],
    }).compile();
    service = module.get(CustomFieldsService);
  });

  afterEach(async () => {
    await module?.close();
  });

  it('lists definitions for an entity', async () => {
    const rows = [{ id: 'f1', entity: 'contact', name: 'MRR', slug: 'mrr', type: 'number' }];
    db.select.mockImplementationOnce(() => makeChain(rows));
    await expect(service.list('contact')).resolves.toEqual(rows);
  });

  it('creates a number field and returns it', async () => {
    const created = {
      id: 'f1',
      entity: 'contact',
      name: 'MRR',
      slug: 'mrr',
      type: 'number',
      options: [],
    };
    db.select.mockImplementationOnce(() => makeChain([]));
    db.insert.mockImplementationOnce(() => makeChain([created]));

    await expect(
      service.create({ entity: 'contact', name: 'MRR', type: 'number' }),
    ).resolves.toEqual(created);
  });

  it('rejects select without options', async () => {
    await expect(
      service.create({ entity: 'contact', name: 'Segment', type: 'select' }),
    ).rejects.toThrow(BadRequestException);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects a colliding slug with 409', async () => {
    db.select.mockImplementationOnce(() =>
      makeChain([{ id: 'old', slug: 'mrr', entity: 'contact' }]),
    );

    await expect(
      service.create({ entity: 'contact', name: 'MRR', type: 'number' }),
    ).rejects.toThrow(ConflictException);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('deletes a definition', async () => {
    db.select.mockImplementationOnce(() => makeChain([{ id: 'f1' }]));
    db.delete.mockImplementationOnce(() => makeChain([]));
    await expect(service.delete('f1')).resolves.toEqual({ deleted: true });
  });

  it('throws when deleting a missing definition', async () => {
    db.select.mockImplementationOnce(() => makeChain([]));
    await expect(service.delete('missing')).rejects.toThrow(NotFoundException);
  });
});
