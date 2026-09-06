import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as schema from './schema';
import type { Db } from './db';
import { UsersService } from '../../modules/users/users.service';
import { RolesService } from '../../modules/roles/roles.service';
import { RbacService } from '../rbac/rbac.service';
import { PipelineStagesService } from '../../modules/leads/pipeline-stages.service';
import { ProjectsService } from '../../modules/boards/projects/projects.service';
import { StatusesService } from '../../modules/boards/statuses/statuses.service';
import { TasksService } from '../../modules/boards/tasks/tasks.service';

/** Real PostgreSQL constraints, transactions and SQL, without external services. */
describe('audit data integrity regressions', () => {
  let pg: PGlite;
  let db: Db;
  let admin: string;
  let manager: string;
  let roleId: string;
  let users: UsersService;
  let roles: RolesService;
  let projects: ProjectsService;
  let statuses: StatusesService;
  let tasks: TasksService;
  const events = { emit: jest.fn() };

  beforeAll(async () => {
    pg = new PGlite();
    const migrations = resolve(__dirname, '../../../../../drizzle/migrations');
    const journal = JSON.parse(readFileSync(resolve(migrations, 'meta/_journal.json'), 'utf8'));
    for (const entry of journal.entries) {
      await pg.exec(readFileSync(resolve(migrations, `${entry.tag}.sql`), 'utf8'));
    }
    // Both adapters implement the same Drizzle PostgreSQL query/transaction surface.
    db = drizzle(pg, { schema }) as unknown as Db;
    const accounts = await db
      .insert(schema.users)
      .values([
        { email: 'admin@example.invalid', passwordHash: 'original' },
        { email: 'manager@example.invalid', passwordHash: 'original' },
      ])
      .returning();
    [admin, manager] = accounts.map((user) => user.id);
    const [role] = await db.insert(schema.roles).values({ name: 'super-admin' }).returning();
    roleId = role.id;
    await db.insert(schema.userRoles).values({ userId: admin, roleId });
    const rbac = new RbacService(db);
    users = new UsersService(db, rbac);
    roles = new RolesService(db, rbac);
    projects = new ProjectsService(db);
    statuses = new StatusesService(db);
    tasks = new TasksService(db, events as any, statuses);
  }, 60_000);
  afterAll(async () => {
    await pg?.close();
  });
  beforeEach(() => events.emit.mockClear());

  it('rejects a settings manager changing or deleting a protected account', async () => {
    await expect(
      users.update(admin, { email: 'taken@example.invalid', password: 'new-password' }, manager),
    ).rejects.toMatchObject({ response: { code: 'SUPER_ADMIN_REQUIRED' } });
    await expect(users.delete(admin, manager)).rejects.toMatchObject({
      response: { code: 'SUPER_ADMIN_REQUIRED' },
    });
    const [unchanged] = await db.select().from(schema.users).where(eq(schema.users.id, admin));
    expect(unchanged).toMatchObject({ email: 'admin@example.invalid', passwordHash: 'original' });
  });

  it('preserves delegated management of ordinary accounts', async () => {
    await users.update(manager, { email: 'changed@example.invalid' }, manager);
    expect((await users.findById(manager)).email).toBe('changed@example.invalid');
  });

  it('serializes both role removal APIs so one super-admin remains', async () => {
    await users.assignRole(manager, roleId);
    const outcomes = await Promise.allSettled([
      users.removeRole(admin, roleId),
      roles.removeFromUser(manager, roleId),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      await db.select().from(schema.userRoles).where(eq(schema.userRoles.roleId, roleId)),
    ).toHaveLength(1);
    // Restore stable fixture for remaining tests.
    await users.assignRole(admin, roleId);
    await users.removeRole(manager, roleId);
  });

  it('retains custom pipeline stages and their leads across repeated board initialization', async () => {
    const stages = new PipelineStagesService(db);
    await stages.ensureDefaults();
    const original = await stages.findAll();
    await stages.delete(original[1].id);
    const custom = await stages.create({ name: 'Custom', color: '#123456' });
    expect(custom.position).toBe(5);
    // An explicit duplicate position is also a valid distinct identity.
    const samePosition = await stages.create({
      name: 'Other',
      color: '#123456',
      position: custom.position,
    });
    await stages.ensureDefaults();
    await stages.ensureDefaults();
    expect(await stages.findById(custom.id)).toBeTruthy();
    expect(await stages.findById(samePosition.id)).toBeTruthy();
    expect(await stages.findAll()).toHaveLength(6);
  });

  it('renames project identifiers without truncation or collisions at 100+', async () => {
    const project = await projects.create({ name: 'Long identifiers', key: 'OLD' }, manager);
    await db.insert(schema.tbTasks).values([
      { moduleId: project.defaultModuleId, title: '12', number: 12, identifier: 'OLD-12' },
      { moduleId: project.defaultModuleId, title: '123', number: 123, identifier: 'OLD-123' },
    ]);
    await projects.update(project.id, { key: 'NEW' });
    const rows = await db
      .select()
      .from(schema.tbTasks)
      .where(eq(schema.tbTasks.moduleId, project.defaultModuleId));
    expect(rows.map((task) => task.identifier).sort()).toEqual(['NEW-12', 'NEW-123']);
    expect((await projects.findById(project.id)).key).toBe('NEW');
  });

  it('rolls back a failed task create, including sequence, tags and events', async () => {
    const project = await projects.create({ name: 'Atomic', key: 'ATOM' }, manager);
    await expect(
      tasks.create(
        { moduleId: project.defaultModuleId, title: 'Invalid', tagIds: [randomUUID()] },
        manager,
      ),
    ).rejects.toThrow();
    expect(
      await db
        .select()
        .from(schema.tbTasks)
        .where(eq(schema.tbTasks.moduleId, project.defaultModuleId)),
    ).toHaveLength(0);
    expect((await projects.findById(project.id)).taskSeq).toBe(0);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('keeps existing task fields and tags when replacement fails', async () => {
    const project = await projects.create({ name: 'Tag rollback', key: 'TAGS' }, manager);
    const [tag] = await db
      .insert(schema.tbTags)
      .values({ name: 'Keep me', color: '#123456' })
      .returning();
    const task = await tasks.create(
      { moduleId: project.defaultModuleId, title: 'Original', tagIds: [tag.id] },
      manager,
    );
    await expect(
      tasks.update(task.id, { title: 'Lost', tagIds: [randomUUID()] }, manager),
    ).rejects.toThrow();
    const persisted = await tasks.findById(task.id);
    expect(persisted.title).toBe('Original');
    expect(persisted.tags.map((row) => row.id)).toEqual([tag.id]);
  });

  it('clears retention when a canceled status becomes done, and purge checks the current status', async () => {
    const project = await projects.create({ name: 'Retention', key: 'RET' }, manager);
    const canceled = (await statuses.findByProject(project.id)).find(
      (status) => status.isCanceled,
    )!;
    const task = await tasks.create(
      { moduleId: project.defaultModuleId, title: 'Keep', statusId: canceled.id },
      manager,
    );
    const old = new Date(Date.now() - 8 * 86_400_000);
    await db.update(schema.tbTasks).set({ canceledAt: old }).where(eq(schema.tbTasks.id, task.id));
    await statuses.update(canceled.id, { isDone: true });
    expect((await tasks.findById(task.id)).canceledAt).toBeNull();
    // Legacy stale dates must not delete a task in a live status either.
    await db.update(schema.tbTasks).set({ canceledAt: old }).where(eq(schema.tbTasks.id, task.id));
    expect(await tasks.purgeExpiredCanceled()).toBe(0);
    expect(await tasks.findById(task.id)).toBeTruthy();
  });

  it('starts a fresh retention clock and clears displaced canceled status dates', async () => {
    const project = await projects.create({ name: 'Flags', key: 'FLAG' }, manager);
    const all = await statuses.findByProject(project.id);
    const canceled = all.find((status) => status.isCanceled)!;
    const active = all.find((status) => !status.isCanceled)!;
    const oldTask = await tasks.create(
      { moduleId: project.defaultModuleId, title: 'Old', statusId: canceled.id },
      manager,
    );
    const newTask = await tasks.create(
      { moduleId: project.defaultModuleId, title: 'New', statusId: active.id },
      manager,
    );
    await statuses.update(active.id, { isCanceled: true });
    expect((await tasks.findById(oldTask.id)).canceledAt).toBeNull();
    expect(Date.parse((await tasks.findById(newTask.id)).canceledAt!)).toBeGreaterThan(
      Date.now() - 10_000,
    );
    await db
      .update(schema.tbTasks)
      .set({ canceledAt: new Date(Date.now() - 8 * 86_400_000) })
      .where(eq(schema.tbTasks.id, newTask.id));
    expect(await tasks.purgeExpiredCanceled()).toBe(1);
    expect(await tasks.findById(oldTask.id)).toBeTruthy();
  });
});
