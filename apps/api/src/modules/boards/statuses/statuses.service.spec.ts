import { StatusesService } from './statuses.service';

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

describe('StatusesService', () => {
  it('update rejects backlog+done together', async () => {
    const existing = {
      id: 's1',
      projectId: 'p1',
      moduleId: null,
      name: 'To do',
      color: '#6F95C9',
      position: 1,
      isBacklog: false,
      isDone: false,
    };
    const db: any = {
      select: jest.fn(() => makeChain([existing])),
      insert: jest.fn(() => makeChain()),
      update: jest.fn(() => makeChain()),
      delete: jest.fn(() => makeChain()),
    };
    const service = new StatusesService(db);
    await expect(service.update('s1', { isBacklog: true, isDone: true })).rejects.toMatchObject({
      response: expect.objectContaining({ statusCode: 400 }),
    });
  });

  it('delete refuses the last status in a project', async () => {
    const only = {
      id: 's1',
      projectId: 'p1',
      moduleId: null,
      name: 'Backlog',
      color: '#8F949C',
      position: 0,
      isBacklog: true,
      isDone: false,
    };
    const db: any = {
      select: jest
        .fn()
        .mockImplementationOnce(() => makeChain([only])) // findById
        .mockImplementationOnce(() => makeChain([only])), // findByProject siblings
      insert: jest.fn(() => makeChain()),
      update: jest.fn(() => makeChain()),
      delete: jest.fn(() => makeChain()),
    };
    const service = new StatusesService(db);
    await expect(service.delete('s1')).rejects.toMatchObject({
      response: expect.objectContaining({ statusCode: 400 }),
    });
    expect(db.delete).not.toHaveBeenCalled();
  });
});
