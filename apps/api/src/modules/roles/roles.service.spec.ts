import { RolesService } from './roles.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

// Thenable sub-chain (never a `.then` on the root db mock — see AGENTS.md).
function makeChain(result: any[] = []) {
  const chain: any = {};
  [
    'from',
    'where',
    'limit',
    'values',
    'set',
    'returning',
    'innerJoin',
    'leftJoin',
    'orderBy',
    'onConflictDoNothing',
  ].forEach((m) => {
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
  // transaction runs the callback with the db itself acting as the tx handle
  db.transaction = jest.fn(async (cb: any) => cb(db));
  return db;
}

describe('RolesService', () => {
  let db: ReturnType<typeof buildDb>;
  let rbac: { invalidate: jest.Mock };
  let service: RolesService;

  beforeEach(() => {
    db = buildDb();
    rbac = { invalidate: jest.fn() };
    service = new RolesService(db as any, rbac as any);
  });

  describe('create', () => {
    it('inserts a role and returns the enriched shape', async () => {
      const created = { id: 'r1', name: 'editor', description: 'Editor role' };
      db.select.mockReturnValueOnce(makeChain([])); // no name clash
      db.insert.mockReturnValueOnce(makeChain([created]));

      const result = await service.create({ name: 'editor', description: 'Editor role' });

      expect(result).toEqual({ ...created, isProtected: false, permissions: [] });
      expect(db.insert).toHaveBeenCalled();
    });

    it('throws ConflictException on duplicate name', async () => {
      db.select.mockReturnValueOnce(makeChain([{ id: 'r0', name: 'editor' }]));

      await expect(service.create({ name: 'editor' })).rejects.toThrow(ConflictException);
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns roles with their permissions', async () => {
      const roleRow = { id: 'r1', name: 'admin', description: null };
      const permRow = { id: 'p1', roleId: 'r1', resource: 'contacts', action: 'read' };
      db.select.mockReturnValueOnce(makeChain([roleRow])).mockReturnValueOnce(makeChain([permRow]));

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].permissions).toHaveLength(1);
      expect(result[0].isProtected).toBe(false);
    });

    it('marks super-admin as protected', async () => {
      db.select
        .mockReturnValueOnce(makeChain([{ id: 'r1', name: 'super-admin', description: null }]))
        .mockReturnValueOnce(makeChain([]));

      const result = await service.findAll();
      expect(result[0].isProtected).toBe(true);
    });
  });

  describe('findById', () => {
    it('returns role with permissions', async () => {
      const roleRow = { id: 'r1', name: 'editor', description: null };
      db.select
        .mockReturnValueOnce(makeChain([roleRow]))
        .mockReturnValueOnce(
          makeChain([{ id: 'p1', roleId: 'r1', resource: 'forms', action: 'manage' }]),
        );

      const result = await service.findById('r1');
      expect(result.isProtected).toBe(false);
      expect(result.permissions).toHaveLength(1);
    });

    it('throws NotFoundException when the role is missing', async () => {
      db.select.mockReturnValueOnce(makeChain([]));
      await expect(service.findById('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('renames a non-protected role (happy path)', async () => {
      const existing = { id: 'r1', name: 'editor', description: null };
      const updated = { id: 'r1', name: 'redactor', description: null };
      db.select
        .mockReturnValueOnce(makeChain([existing])) // lookup by id
        .mockReturnValueOnce(makeChain([])); // no name clash
      db.update.mockReturnValueOnce(makeChain([updated]));

      const result = await service.update('r1', { name: 'redactor' });
      expect(result).toEqual(updated);
      expect(db.update).toHaveBeenCalled();
    });

    it('throws NotFoundException when the role is missing', async () => {
      db.select.mockReturnValueOnce(makeChain([]));
      await expect(service.update('r1', { name: 'x' })).rejects.toThrow(NotFoundException);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when renaming a protected role', async () => {
      db.select.mockReturnValueOnce(
        makeChain([{ id: 'r1', name: 'super-admin', description: null }]),
      );
      await expect(service.update('r1', { name: 'admin' })).rejects.toThrow(BadRequestException);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the new name already exists', async () => {
      db.select
        .mockReturnValueOnce(makeChain([{ id: 'r1', name: 'editor', description: null }]))
        .mockReturnValueOnce(makeChain([{ id: 'r2', name: 'redactor' }]));
      await expect(service.update('r1', { name: 'redactor' })).rejects.toThrow(ConflictException);
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('throws NotFoundException when the role is missing', async () => {
      db.select.mockReturnValueOnce(makeChain([]));
      await expect(service.delete('r1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for a protected role', async () => {
      db.select.mockReturnValueOnce(
        makeChain([{ id: 'r1', name: 'super-admin', description: null }]),
      );
      await expect(service.delete('r1')).rejects.toThrow(BadRequestException);
      expect(db.delete).not.toHaveBeenCalled();
    });

    it('removes a non-protected role', async () => {
      db.select.mockReturnValueOnce(makeChain([{ id: 'r2', name: 'editor', description: null }]));
      await service.delete('r2');
      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe('setPermissions', () => {
    it('throws NotFoundException when the role is missing', async () => {
      db.select.mockReturnValueOnce(makeChain([]));
      await expect(
        service.setPermissions('r1', [{ resource: 'forms', action: 'manage' }]),
      ).rejects.toThrow(NotFoundException);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for a protected role', async () => {
      db.select.mockReturnValueOnce(
        makeChain([{ id: 'r1', name: 'super-admin', description: null }]),
      );
      await expect(
        service.setPermissions('r1', [{ resource: 'forms', action: 'manage' }]),
      ).rejects.toThrow(BadRequestException);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('atomically deletes old and inserts new permissions in a transaction', async () => {
      const permRow = { id: 'p1', roleId: 'r1', resource: 'forms', action: 'manage' };
      db.select.mockReturnValueOnce(makeChain([{ id: 'r1', name: 'editor', description: null }]));
      db.insert.mockReturnValueOnce(makeChain([permRow]));

      const result = await service.setPermissions('r1', [{ resource: 'forms', action: 'manage' }]);

      expect(db.transaction).toHaveBeenCalled();
      expect(db.delete).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled();
      expect(result).toEqual([permRow]);
      expect(rbac.invalidate).toHaveBeenCalledWith(); // role-wide: clear all
    });

    it('with an empty array only deletes inside the transaction', async () => {
      db.select.mockReturnValueOnce(makeChain([{ id: 'r1', name: 'editor', description: null }]));

      const result = await service.setPermissions('r1', []);

      expect(db.transaction).toHaveBeenCalled();
      expect(db.delete).toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('assignToUser', () => {
    it('throws NotFoundException when the user is missing', async () => {
      db.select.mockReturnValueOnce(makeChain([])); // user lookup empty
      await expect(service.assignToUser('u1', 'r1')).rejects.toThrow(NotFoundException);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the role is missing', async () => {
      db.select
        .mockReturnValueOnce(makeChain([{ id: 'u1' }])) // user exists
        .mockReturnValueOnce(makeChain([])); // role missing
      await expect(service.assignToUser('u1', 'r1')).rejects.toThrow(NotFoundException);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('inserts the assignment with onConflictDoNothing', async () => {
      const insertChain = makeChain([]);
      db.select
        .mockReturnValueOnce(makeChain([{ id: 'u1' }]))
        .mockReturnValueOnce(makeChain([{ id: 'r1', name: 'editor' }]));
      db.insert.mockReturnValueOnce(insertChain);

      await service.assignToUser('u1', 'r1');

      expect(insertChain.values).toHaveBeenCalledWith({ userId: 'u1', roleId: 'r1' });
      expect(insertChain.onConflictDoNothing).toHaveBeenCalled();
      expect(rbac.invalidate).toHaveBeenCalledWith('u1'); // that user only
    });
  });

  describe('removeFromUser', () => {
    it('throws NotFoundException when the user is missing', async () => {
      db.select.mockReturnValueOnce(makeChain([]));
      await expect(service.removeFromUser('u1', 'r1')).rejects.toThrow(NotFoundException);
      expect(db.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the role is missing', async () => {
      db.select.mockReturnValueOnce(makeChain([{ id: 'u1' }])).mockReturnValueOnce(makeChain([]));
      await expect(service.removeFromUser('u1', 'r1')).rejects.toThrow(NotFoundException);
      expect(db.delete).not.toHaveBeenCalled();
    });

    it('blocks removing the last super-admin', async () => {
      db.select
        .mockReturnValueOnce(makeChain([{ id: 'u1' }]))
        .mockReturnValueOnce(makeChain([{ id: 'r1', name: 'super-admin' }]))
        .mockReturnValueOnce(makeChain([{ userId: 'u1', roleId: 'r1' }])); // single holder
      await expect(service.removeFromUser('u1', 'r1')).rejects.toThrow(BadRequestException);
      expect(db.delete).not.toHaveBeenCalled();
    });

    it('allows removing a super-admin when others still hold it', async () => {
      db.select
        .mockReturnValueOnce(makeChain([{ id: 'u1' }]))
        .mockReturnValueOnce(makeChain([{ id: 'r1', name: 'super-admin' }]))
        .mockReturnValueOnce(
          makeChain([
            { userId: 'u1', roleId: 'r1' },
            { userId: 'u2', roleId: 'r1' },
          ]),
        );
      await service.removeFromUser('u1', 'r1');
      expect(db.delete).toHaveBeenCalled();
    });

    it('removes a non-protected role assignment without a holder count', async () => {
      db.select
        .mockReturnValueOnce(makeChain([{ id: 'u1' }]))
        .mockReturnValueOnce(makeChain([{ id: 'r1', name: 'editor' }]));
      await service.removeFromUser('u1', 'r1');
      expect(db.delete).toHaveBeenCalled();
    });
  });
});
