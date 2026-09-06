import { TasksService } from './tasks.service';
import { StatusesService } from '../statuses/statuses.service';
import { EventsService } from '../../../core/events/events.service';

function makeChain(returnValue: unknown = []) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    leftJoin: () => chain,
    innerJoin: () => chain,
    orderBy: () => chain,
    groupBy: () => chain,
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

describe('TasksService', () => {
  let emit: jest.Mock;
  let statuses: { findByModule: jest.Mock; findById: jest.Mock };
  let db: any;
  let service: TasksService;

  beforeEach(() => {
    emit = jest.fn();
    statuses = {
      findByModule: jest.fn().mockResolvedValue([
        { id: 's-backlog', isBacklog: true, name: 'Backlog' },
        { id: 's-todo', isBacklog: false, name: 'To do' },
      ]),
      findById: jest.fn().mockResolvedValue({ id: 's-todo' }),
    };
    db = {
      select: jest.fn(() => makeChain()),
      insert: jest.fn(() => makeChain()),
      update: jest.fn(() => makeChain()),
      delete: jest.fn(() => makeChain()),
    };
    db.transaction = jest.fn(async (cb: any) => cb(db));
    db.execute = jest.fn().mockResolvedValue([]);
    service = new TasksService(
      db,
      { emit } as unknown as EventsService,
      statuses as unknown as StatusesService,
    );
  });

  describe('findMyTasks', () => {
    it('returns all assigned tasks including backlog', async () => {
      const assignedChain = makeChain([{ taskId: 't1' }, { taskId: 't2' }]);
      const joined = [
        {
          task: {
            id: 't1',
            moduleId: 'm1',
            statusId: 's-backlog',
            title: 'Backlog task',
            priority: 'medium',
            position: 0,
            parentTaskId: null,
            description: null,
            dueDate: null,
            leadId: null,
            createdBy: 'u1',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          status: {
            id: 's-backlog',
            name: 'Backlog',
            color: '#ccc',
            isBacklog: true,
            isDone: false,
          },
          module: { id: 'm1', name: 'Mod', projectId: 'p1' },
          project: { id: 'p1', name: 'Proj', color: '#000' },
        },
        {
          task: {
            id: 't2',
            moduleId: 'm1',
            statusId: 's-todo',
            title: 'Active task',
            priority: 'high',
            position: 1,
            parentTaskId: null,
            description: null,
            dueDate: null,
            leadId: null,
            createdBy: 'u1',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          status: { id: 's-todo', name: 'To do', color: '#00f', isBacklog: false, isDone: false },
          module: { id: 'm1', name: 'Mod', projectId: 'p1' },
          project: { id: 'p1', name: 'Proj', color: '#000' },
        },
      ];

      // assigned → joined → attachDetails (assignees, tags, comments, subtasks)
      db.select
        .mockImplementationOnce(() => assignedChain)
        .mockImplementationOnce(() => makeChain(joined))
        .mockImplementation(() => makeChain([]));

      const result = await service.findMyTasks('u1');
      expect(result).toHaveLength(2);
      expect(result.map((t) => t.id)).toEqual(['t1', 't2']);
    });

    it('returns empty when user has no assignments', async () => {
      db.select.mockImplementationOnce(() => makeChain([]));
      const result = await service.findMyTasks('u1');
      expect(result).toEqual([]);
    });
  });

  describe('updateStatus', () => {
    it('emits boards.task.moved via EventsService', async () => {
      const existing = {
        id: 't1',
        moduleId: 'm1',
        statusId: 's-backlog',
        title: 'Task',
        priority: 'medium',
        position: 0,
        parentTaskId: null,
        description: null,
        dueDate: null,
        leadId: null,
        createdBy: 'u1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updated = { ...existing, statusId: 's-todo', position: 2 };

      db.select.mockImplementationOnce(() => makeChain([existing]));
      db.update.mockImplementationOnce(() => makeChain([updated]));
      db.insert.mockImplementationOnce(() => makeChain([{}]));

      await service.updateStatus('t1', 's-todo', 2, 'u1');

      expect(statuses.findByModule).toHaveBeenCalledWith('m1', db);
      expect(emit).toHaveBeenCalledWith('boards.task.moved', {
        taskId: 't1',
        statusId: 's-todo',
        moduleId: 'm1',
        position: 2,
      });
    });

    it('rejects a status that is not on the module board', async () => {
      const existing = {
        id: 't1',
        moduleId: 'm1',
        statusId: 's-backlog',
        title: 'Task',
        priority: 'medium',
        position: 0,
        parentTaskId: null,
        description: null,
        dueDate: null,
        leadId: null,
        createdBy: 'u1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db.select.mockImplementationOnce(() => makeChain([existing]));

      await expect(service.updateStatus('t1', 's-other-project', 0, 'u1')).rejects.toThrow();
      expect(emit).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('emits boards.task.deleted with moduleId', async () => {
      const existing = {
        id: 't1',
        moduleId: 'm1',
        statusId: 's-todo',
        title: 'Task',
        priority: 'medium',
        position: 0,
        parentTaskId: null,
        description: null,
        dueDate: null,
        leadId: null,
        createdBy: 'u1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db.select.mockImplementationOnce(() => makeChain([existing]));
      db.delete.mockImplementationOnce(() => makeChain());

      await service.delete('t1');

      expect(emit).toHaveBeenCalledWith('boards.task.deleted', {
        taskId: 't1',
        moduleId: 'm1',
      });
    });
  });

  describe('purgeExpiredCanceled', () => {
    it('returns 0 when nothing is expired', async () => {
      db.select.mockImplementationOnce(() => makeChain([]));
      const n = await service.purgeExpiredCanceled();
      expect(n).toBe(0);
      expect(emit).not.toHaveBeenCalled();
    });

    it('deletes expired canceled tasks and emits events', async () => {
      db.delete.mockImplementationOnce(() =>
        makeChain([
          { id: 't-old', moduleId: 'm1' },
          { id: 't-old-2', moduleId: 'm2' },
        ]),
      );

      const n = await service.purgeExpiredCanceled(new Date('2026-08-07T12:00:00Z'));
      expect(n).toBe(2);
      expect(db.delete).toHaveBeenCalled();
      expect(emit).toHaveBeenCalledWith('boards.task.deleted', {
        taskId: 't-old',
        moduleId: 'm1',
      });
      expect(emit).toHaveBeenCalledWith('boards.task.deleted', {
        taskId: 't-old-2',
        moduleId: 'm2',
      });
    });
  });

  describe('update', () => {
    it('rejects statusId that is not on the module board', async () => {
      const existing = {
        id: 't1',
        moduleId: 'm1',
        statusId: 's-todo',
        title: 'Task',
        priority: 'medium',
        position: 0,
        parentTaskId: null,
        description: null,
        dueDate: null,
        leadId: null,
        createdBy: 'u1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      db.select.mockImplementationOnce(() => makeChain([existing]));

      await expect(service.update('t1', { statusId: 's-foreign' }, 'u1')).rejects.toThrow();
    });
  });

  describe('create', () => {
    it('logs activity task.created', async () => {
      const mod = {
        id: 'm1',
        projectId: 'p1',
        name: 'Mod',
        description: null,
        position: 0,
        createdAt: new Date(),
      };
      const created = {
        id: 't-new',
        moduleId: 'm1',
        statusId: 's-backlog',
        title: 'New',
        priority: 'medium',
        position: 0,
        number: 1,
        identifier: 'PROJ-01',
        parentTaskId: null,
        description: null,
        dueDate: null,
        leadId: null,
        createdBy: 'u1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const activityInsert = jest.fn(() => makeChain([{}]));

      db.select
        .mockImplementationOnce(() => makeChain([mod])) // requireModule
        // findById path after create — keep returning enough for attachDetails
        .mockImplementation(() => makeChain([]));

      db.update.mockImplementationOnce(() => makeChain([{ id: 'p1', key: 'PROJ', taskSeq: 1 }]));

      db.insert
        .mockImplementationOnce(() => makeChain([created])) // task
        .mockImplementationOnce(activityInsert); // activity

      // Stub findById by spying
      jest.spyOn(service, 'findById').mockResolvedValue({
        ...created,
        dueDate: null,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
        status: null,
        module: { id: 'm1', name: 'Mod', projectId: 'p1' },
        project: { id: 'p1', name: 'Proj', color: '#000', key: 'PROJ' },
        assignees: [],
        tags: [],
        commentCount: 0,
        subtaskCount: 0,
        subtasks: [],
        comments: [],
      } as any);

      await service.create({ moduleId: 'm1', title: 'New' }, 'u1');

      expect(activityInsert).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled();
      expect(db.update).toHaveBeenCalled();
    });
  });
});
