import { Test, TestingModule } from '@nestjs/testing';
import { FormsStatsService } from './forms-stats.service';
import { DB_TOKEN } from '../../core/database/database.module';

function makeChain(result: any[] = []) {
  const chain: any = {};
  const _result = result;

  ['from', 'where', 'limit', 'offset', 'groupBy', 'orderBy', 'leftJoin', 'innerJoin'].forEach(
    (m) => {
      chain[m] = jest.fn().mockReturnValue(chain);
    },
  );

  chain.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(_result).then(onFulfilled, onRejected);

  return chain;
}

function buildDb() {
  const db: any = {
    select: jest.fn(),
  };
  db.select.mockImplementation(() => makeChain([]));
  return db;
}

describe('FormsStatsService', () => {
  let service: FormsStatsService;
  let module: TestingModule;
  let db: ReturnType<typeof buildDb>;

  beforeEach(async () => {
    db = buildDb();

    module = await Test.createTestingModule({
      providers: [FormsStatsService, { provide: DB_TOKEN, useValue: db }],
    }).compile();

    service = module.get(FormsStatsService);
  });

  afterEach(async () => {
    await module?.close();
  });

  it('returns aggregated stats', async () => {
    db.select
      .mockImplementationOnce(() => makeChain([{ count: 12 }]))
      .mockImplementationOnce(() => makeChain([{ count: 3 }]))
      .mockImplementationOnce(() =>
        makeChain([
          { formId: 'f1', formName: 'Contact', count: 8 },
          { formId: 'f2', formName: 'Waitlist', count: 4 },
        ]),
      );

    const result = await service.getStats({});

    expect(result.total).toBe(12);
    expect(result.activeForms).toBe(3);
    expect(result.byForm).toHaveLength(2);
    expect(result.byDay).toBeUndefined();
  });

  it('includes daily buckets when requested', async () => {
    db.select
      .mockImplementationOnce(() => makeChain([{ count: 5 }]))
      .mockImplementationOnce(() => makeChain([{ count: 2 }]))
      .mockImplementationOnce(() => makeChain([{ formId: 'f1', formName: 'Contact', count: 5 }]))
      .mockImplementationOnce(() =>
        makeChain([
          { day: '2026-07-14', count: 2 },
          { day: '2026-07-15', count: 3 },
        ]),
      );

    const result = await service.getStats({ daily: true });

    expect(result.byDay).toEqual([
      { day: '2026-07-14', count: 2 },
      { day: '2026-07-15', count: 3 },
    ]);
  });
});
