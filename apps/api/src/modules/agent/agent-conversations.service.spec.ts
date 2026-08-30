import { Test, TestingModule } from '@nestjs/testing';
import { AgentConversationsService, truncateTitle } from './agent-conversations.service';
import { DB_TOKEN } from '../../core/database/database.module';

function makeChain(result: any[] = []) {
  const chain: any = {};
  let _result = result;

  ['from', 'where', 'limit', 'values', 'set', 'returning', 'orderBy', 'delete'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });

  chain.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(_result).then(onFulfilled, onRejected);

  chain.resolveWith = (r: any[]) => {
    _result = r;
    return chain;
  };

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

describe('AgentConversationsService', () => {
  let service: AgentConversationsService;
  let db: ReturnType<typeof buildDb>;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    db = buildDb();
    moduleRef = await Test.createTestingModule({
      providers: [AgentConversationsService, { provide: DB_TOKEN, useValue: db }],
    }).compile();
    service = moduleRef.get(AgentConversationsService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  describe('truncateTitle', () => {
    it('collapses whitespace and truncates long titles', () => {
      const long = 'word '.repeat(30).trim();
      expect(truncateTitle(long).length).toBeLessThanOrEqual(80);
      expect(truncateTitle('  hello   world  ')).toBe('hello world');
    });
  });

  describe('listForUser', () => {
    it('returns conversations for the user', async () => {
      const rows = [{ id: 'c1', title: 'Hi', createdAt: new Date(), updatedAt: new Date() }];
      db.select.mockImplementationOnce(() => makeChain(rows).resolveWith(rows));

      const result = await service.listForUser('user-1');
      expect(result).toEqual(rows);
    });
  });

  describe('getForUser', () => {
    it('returns conversation with messages', async () => {
      const conversation = { id: 'c1', userId: 'user-1', title: 'Hi' };
      const messages = [{ id: 'm1', role: 'user', content: 'hello' }];
      db.select
        .mockImplementationOnce(() => makeChain([conversation]))
        .mockImplementationOnce(() => makeChain(messages));

      const result = await service.getForUser('user-1', 'c1');
      expect(result).toMatchObject({ id: 'c1', messages });
    });

    it('throws when conversation is missing', async () => {
      db.select.mockImplementationOnce(() => makeChain([]));
      await expect(service.getForUser('user-1', 'missing')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });
  });

  describe('deleteForUser', () => {
    it('deletes an owned conversation', async () => {
      db.select.mockImplementationOnce(() => makeChain([{ id: 'c1' }]));
      db.delete.mockImplementationOnce(() => makeChain([]));

      await service.deleteForUser('user-1', 'c1');
      expect(db.delete).toHaveBeenCalled();
    });

    it('throws when conversation is not owned', async () => {
      db.select.mockImplementationOnce(() => makeChain([]));
      await expect(service.deleteForUser('user-1', 'c1')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });
  });

  describe('createConversation', () => {
    it('inserts with truncated title', async () => {
      const created = { id: 'c1', title: 'Hello' };
      db.insert.mockImplementationOnce(() => makeChain([created]));

      const result = await service.createConversation('user-1', 'Hello');
      expect(result).toEqual(created);
    });
  });

  describe('assertOwned', () => {
    it('returns row when owned', async () => {
      db.select.mockImplementationOnce(() => makeChain([{ id: 'c1' }]));
      await expect(service.assertOwned('user-1', 'c1')).resolves.toEqual({ id: 'c1' });
    });

    it('throws when not owned', async () => {
      db.select.mockImplementationOnce(() => makeChain([]));
      await expect(service.assertOwned('user-1', 'c1')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'NOT_FOUND' }),
      });
    });
  });

  describe('loadHistory', () => {
    it('maps role and content only', async () => {
      db.select.mockImplementationOnce(() =>
        makeChain([
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hey' },
        ]),
      );

      await expect(service.loadHistory('c1')).resolves.toEqual([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hey' },
      ]);
    });
  });
});
