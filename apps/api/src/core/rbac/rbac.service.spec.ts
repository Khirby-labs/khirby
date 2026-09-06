import { RbacService } from './rbac.service';

describe('RbacService', () => {
  const mockPermissions = [
    { resource: 'contacts', action: 'read' },
    { resource: 'roles', action: 'manage' },
  ];

  // Each select() call yields a fresh chain terminating at .where(), which
  // resolves to the next queued result — lets us assert re-query vs cache hit.
  function makeDb(queue: unknown[][]) {
    let i = 0;
    const select = jest.fn(() => ({
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue(queue[Math.min(i++, queue.length - 1)]),
    }));
    return { select };
  }

  it('getUserPermissions returns permissions for userId', async () => {
    const db = makeDb([mockPermissions]);
    const service = new RbacService(db as any);
    const result = await service.getUserPermissions('user-1');
    expect(result).toEqual(mockPermissions);
    expect(db.select).toHaveBeenCalled();
  });

  it('hasPermission returns true when permission exists', async () => {
    const db = makeDb([mockPermissions]);
    const service = new RbacService(db as any);
    expect(await service.hasPermission('user-1', 'contacts', 'read')).toBe(true);
  });

  it('hasPermission returns false when permission does not exist', async () => {
    const db = makeDb([mockPermissions]);
    const service = new RbacService(db as any);
    expect(await service.hasPermission('user-1', 'contacts', 'delete')).toBe(false);
  });

  it('hasPermission returns false when user has no permissions', async () => {
    const db = makeDb([[]]);
    const service = new RbacService(db as any);
    expect(await service.hasPermission('user-1', 'contacts', 'read')).toBe(false);
  });

  it('merges permissions across multiple roles', async () => {
    // Join across two roles produces the union of their permission rows.
    const rows = [
      { resource: 'contacts', action: 'read' },
      { resource: 'forms', action: 'manage' },
      { resource: 'roles', action: 'manage' },
    ];
    const db = makeDb([rows]);
    const service = new RbacService(db as any);
    const result = await service.getUserPermissions('user-1');
    expect(result).toEqual(rows);
  });

  it('dedupes duplicate permission rows from overlapping roles', async () => {
    const rows = [
      { resource: 'contacts', action: 'read' },
      { resource: 'contacts', action: 'read' },
      { resource: 'forms', action: 'manage' },
    ];
    const db = makeDb([rows]);
    const service = new RbacService(db as any);
    const result = await service.getUserPermissions('user-1');
    expect(result).toEqual([
      { resource: 'contacts', action: 'read' },
      { resource: 'forms', action: 'manage' },
    ]);
  });

  it('serves a cache hit within TTL without re-querying', async () => {
    const db = makeDb([mockPermissions]);
    const service = new RbacService(db as any);
    await service.getUserPermissions('user-1');
    await service.getUserPermissions('user-1');
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('invalidate(userId) forces a re-query for that user', async () => {
    const db = makeDb([mockPermissions]);
    const service = new RbacService(db as any);
    await service.getUserPermissions('user-1');
    service.invalidate('user-1');
    await service.getUserPermissions('user-1');
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it('invalidate() with no arg clears every user', async () => {
    const db = makeDb([mockPermissions]);
    const service = new RbacService(db as any);
    await service.getUserPermissions('user-1');
    service.invalidate();
    await service.getUserPermissions('user-1');
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it('isSuperAdmin returns true when a protected role is held', async () => {
    const db = makeDb([[{ name: 'super-admin' }]]);
    const service = new RbacService(db as any);
    expect(await service.isSuperAdmin('user-1')).toBe(true);
  });

  it('isSuperAdmin returns false when no protected role is held', async () => {
    const db = makeDb([[]]);
    const service = new RbacService(db as any);
    expect(await service.isSuperAdmin('user-1')).toBe(false);
  });

  it('caches isSuperAdmin and re-queries after invalidate', async () => {
    const db = makeDb([[{ name: 'super-admin' }]]);
    const service = new RbacService(db as any);
    await service.isSuperAdmin('user-1');
    await service.isSuperAdmin('user-1');
    expect(db.select).toHaveBeenCalledTimes(1);
    service.invalidate('user-1');
    await service.isSuperAdmin('user-1');
    expect(db.select).toHaveBeenCalledTimes(2);
  });
  it.each(['isSuperAdmin', 'getUserPermissions'] as const)(
    'does not refill %s cache from a read that predates invalidation',
    async (method) => {
      let resolveOld!: (rows: any[]) => void;
      const oldRead = new Promise<any[]>((resolve) => {
        resolveOld = resolve;
      });
      const where = jest.fn().mockReturnValueOnce(oldRead).mockResolvedValue([]);
      const db = { select: jest.fn(() => ({ from: () => ({ innerJoin: () => ({ where }) }) })) };
      const service = new RbacService(db as any);
      const pending = service[method]('user');
      service.invalidate('user');
      resolveOld([{ name: 'super-admin', resource: 'settings', action: 'manage' }]);
      await pending;
      expect(await service[method]('user')).toEqual(method === 'isSuperAdmin' ? false : []);
      expect(db.select).toHaveBeenCalledTimes(2);
    },
  );
});
