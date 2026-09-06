import { UsersService } from './users.service';
import { BadRequestException } from '@nestjs/common';

// Thenable sub-chain (never a `.then` on the root db mock — see AGENTS.md).
function makeChain(result: any[] = []) {
  const chain: any = {};
  ['from', 'where', 'limit', 'values', 'set', 'returning', 'innerJoin'].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain.then = (onF: any, onR: any) => Promise.resolve(result).then(onF, onR);
  return chain;
}

function buildDb() {
  const db: any = {
    select: jest.fn(() => makeChain([])),
    insert: jest.fn(() => makeChain([])),
    update: jest.fn(() => makeChain([])),
    delete: jest.fn(() => makeChain([])),
  };
  db.transaction = jest.fn(async (cb: any) => cb(db));
  db.execute = jest.fn().mockResolvedValue([]);
  return db;
}

describe('UsersService', () => {
  let db: ReturnType<typeof buildDb>;
  let rbac: { invalidate: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    db = buildDb();
    rbac = { invalidate: jest.fn() };
    service = new UsersService(db, rbac as any);
  });

  describe('removeRole', () => {
    it('blocks removing the last super-admin', async () => {
      db.select
        .mockReturnValueOnce(makeChain([{ id: 'r1', name: 'super-admin' }])) // role lookup
        .mockReturnValueOnce(makeChain([{ userId: 'u1', roleId: 'r1' }])); // single holder

      await expect(service.removeRole('u1', 'r1')).rejects.toThrow(BadRequestException);
      expect(db.delete).not.toHaveBeenCalled();
    });

    it('allows removing a super-admin when others still hold it', async () => {
      db.select
        .mockReturnValueOnce(makeChain([{ id: 'r1', name: 'super-admin' }]))
        .mockReturnValueOnce(
          makeChain([
            { userId: 'u1', roleId: 'r1' },
            { userId: 'u2', roleId: 'r1' },
          ]),
        )
        .mockReturnValueOnce(makeChain([{ id: 'u1', email: 'a@b.com', createdAt: new Date() }])) // findById user
        .mockReturnValueOnce(makeChain([])); // findById roles

      await service.removeRole('u1', 'r1');
      expect(db.delete).toHaveBeenCalled();
      expect(rbac.invalidate).toHaveBeenCalledWith('u1');
    });

    it('removes a non-protected role without counting holders', async () => {
      db.select
        .mockReturnValueOnce(makeChain([{ id: 'r1', name: 'editor' }]))
        .mockReturnValueOnce(makeChain([{ id: 'u1', email: 'a@b.com', createdAt: new Date() }]))
        .mockReturnValueOnce(makeChain([]));

      await service.removeRole('u1', 'r1');
      expect(db.delete).toHaveBeenCalled();
    });
  });
});
