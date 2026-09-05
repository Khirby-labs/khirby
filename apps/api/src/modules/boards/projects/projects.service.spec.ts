import { ProjectsService } from './projects.service';

function makeChain(returnValue: unknown = []) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    insert: () => chain,
    values: () => chain,
    update: () => chain,
    set: () => chain,
    delete: () => chain,
    returning: () => chain,
    then(resolve: (v: unknown) => unknown) {
      return Promise.resolve(returnValue).then(resolve);
    },
  };
  return chain;
}

describe('ProjectsService', () => {
  it('create inserts project with key, default backlog module and statuses', async () => {
    const project = {
      id: 'p1',
      name: 'Alpha',
      description: null,
      color: '#6366f1',
      key: 'ALPHA',
      taskSeq: 0,
      createdBy: 'u1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const mod = { id: 'm1', projectId: 'p1', name: 'Backlog', position: 0 };

    const db: any = {
      select: jest.fn(() => makeChain([])),
      insert: jest
        .fn()
        .mockImplementationOnce(() => makeChain([project]))
        .mockImplementationOnce(() => makeChain([mod]))
        .mockImplementation(() => makeChain([{}])),
      update: jest.fn(() => makeChain()),
      delete: jest.fn(() => makeChain()),
      execute: jest.fn(),
    };

    db.transaction = jest.fn(async (cb: any) => cb(db));
    db.execute = jest.fn().mockResolvedValue([]);
    const service = new ProjectsService(db);
    const result = await service.create({ name: 'Alpha' }, 'u1');

    expect(result.id).toBe('p1');
    expect(result.defaultModuleId).toBe('m1');
    expect(result.key).toBe('ALPHA');
    // project + module + 5 default statuses (incl. Canceled)
    expect(db.insert).toHaveBeenCalledTimes(7);
  });

  it('findById throws when missing', async () => {
    const db: any = {
      select: jest.fn(() => makeChain([])),
    };
    db.transaction = jest.fn(async (cb: any) => cb(db));
    db.execute = jest.fn().mockResolvedValue([]);
    const service = new ProjectsService(db);
    await expect(service.findById('missing')).rejects.toThrow();
  });
});
