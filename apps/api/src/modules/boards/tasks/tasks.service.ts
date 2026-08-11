import { Injectable, Inject } from '@nestjs/common';
import { eq, asc, and, inArray, sql, desc, isNotNull, lt } from 'drizzle-orm';
import { users, leads } from '../../../core/database/schema';
import {
  tbTasks,
  tbTaskAssignees,
  tbTaskTags,
  tbTaskComments,
  tbTaskActivity,
  tbStatuses,
  tbModules,
  tbTags,
  tbProjects,
} from '../../../core/database/schema';
import { StatusesService } from '../statuses/statuses.service';
import { formatTaskIdentifier, parseTaskRef } from '../task-key';
import { DB_TOKEN } from '../../../core/database/database.module';
import type { Db } from '../../../core/database/db';
import { AppException } from '../../../core/errors/app-exception';
import { EventsService } from '../../../core/events/events.service';

/** Soft-canceled tasks older than this are hard-deleted by the purge worker. */
export const CANCELED_TASK_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface CreateTaskDto {
  moduleId: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  statusId?: string;
  parentTaskId?: string;
  dueDate?: string | null;
  leadId?: string | null;
  assigneeIds?: string[];
  tagIds?: string[];
}

export interface UpdateTaskDto {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  statusId?: string | null;
  dueDate?: string | null;
  leadId?: string | null;
  moduleId?: string;
  assigneeIds?: string[];
  tagIds?: string[];
}

export interface ProjectTaskFilters {
  moduleId?: string;
  assigneeId?: string;
  priority?: string;
  statusId?: string;
  tagId?: string;
}

@Injectable()
export class TasksService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private readonly events: EventsService,
    private statuses: StatusesService,
  ) {}

  async findMyTasks(userId: string) {
    const assigned = await this.db
      .select({ taskId: tbTaskAssignees.taskId })
      .from(tbTaskAssignees)
      .where(eq(tbTaskAssignees.userId, userId));

    if (assigned.length === 0) return [];

    const taskIds = assigned.map((a) => a.taskId);
    const rows = await this.db
      .select({
        task: tbTasks,
        status: tbStatuses,
        module: tbModules,
        project: tbProjects,
      })
      .from(tbTasks)
      .leftJoin(tbStatuses, eq(tbTasks.statusId, tbStatuses.id))
      .innerJoin(tbModules, eq(tbTasks.moduleId, tbModules.id))
      .innerJoin(tbProjects, eq(tbModules.projectId, tbProjects.id))
      .where(inArray(tbTasks.id, taskIds))
      .orderBy(desc(tbTasks.updatedAt));

    return this.attachDetails(rows.map((r) => this.serializeJoined(r)));
  }

  async findByIdentifier(identifier: string) {
    const normalized = identifier.trim().toUpperCase();
    const [row] = await this.db
      .select({ id: tbTasks.id })
      .from(tbTasks)
      .where(eq(tbTasks.identifier, normalized))
      .limit(1);
    if (!row) throw AppException.notFound('task', identifier);
    return this.findById(row.id);
  }

  /** Resolve UUID, bare KEY-NN, or KEY-NN-title-slug (friendly SPA URLs). */
  async findByRef(ref: string) {
    const parsed = parseTaskRef(ref);
    if (parsed.kind === 'uuid') return this.findById(parsed.value);
    return this.findByIdentifier(parsed.value);
  }

  async findByProject(projectId: string, filters: ProjectTaskFilters = {}) {
    const modules = await this.db
      .select()
      .from(tbModules)
      .where(eq(tbModules.projectId, projectId));
    if (modules.length === 0) return [];

    let moduleIds = modules.map((m) => m.id);
    if (filters.moduleId) {
      if (!moduleIds.includes(filters.moduleId)) return [];
      moduleIds = [filters.moduleId];
    }

    const rows = await this.db
      .select({
        task: tbTasks,
        status: tbStatuses,
        module: tbModules,
        project: tbProjects,
      })
      .from(tbTasks)
      .leftJoin(tbStatuses, eq(tbTasks.statusId, tbStatuses.id))
      .innerJoin(tbModules, eq(tbTasks.moduleId, tbModules.id))
      .innerJoin(tbProjects, eq(tbModules.projectId, tbProjects.id))
      .where(inArray(tbTasks.moduleId, moduleIds))
      .orderBy(asc(tbTasks.position));

    let result = rows.map((r) => this.serializeJoined(r));

    if (filters.statusId) {
      result = result.filter((t) => t.statusId === filters.statusId);
    }
    if (filters.priority) {
      result = result.filter((t) => t.priority === filters.priority);
    }
    if (filters.assigneeId) {
      const assigned = await this.db
        .select({ taskId: tbTaskAssignees.taskId })
        .from(tbTaskAssignees)
        .where(eq(tbTaskAssignees.userId, filters.assigneeId));
      const set = new Set(assigned.map((a) => a.taskId));
      result = result.filter((t) => set.has(t.id));
    }
    if (filters.tagId) {
      const tagged = await this.db
        .select({ taskId: tbTaskTags.taskId })
        .from(tbTaskTags)
        .where(eq(tbTaskTags.tagId, filters.tagId));
      const set = new Set(tagged.map((t) => t.taskId));
      result = result.filter((t) => set.has(t.id));
    }

    return this.attachDetails(result);
  }

  async findByModule(moduleId: string) {
    await this.requireModule(moduleId);
    const statuses = await this.statuses.findByModule(moduleId);

    const rows = await this.db
      .select({
        task: tbTasks,
        status: tbStatuses,
        module: tbModules,
        project: tbProjects,
      })
      .from(tbTasks)
      .leftJoin(tbStatuses, eq(tbTasks.statusId, tbStatuses.id))
      .innerJoin(tbModules, eq(tbTasks.moduleId, tbModules.id))
      .innerJoin(tbProjects, eq(tbModules.projectId, tbProjects.id))
      .where(and(eq(tbTasks.moduleId, moduleId), sql`${tbTasks.parentTaskId} IS NULL`))
      .orderBy(asc(tbTasks.position));

    const tasks = await this.attachDetails(rows.map((r) => this.serializeJoined(r)));
    return { statuses, tasks };
  }

  async findById(id: string) {
    const [row] = await this.db
      .select({
        task: tbTasks,
        status: tbStatuses,
        module: tbModules,
        project: tbProjects,
      })
      .from(tbTasks)
      .leftJoin(tbStatuses, eq(tbTasks.statusId, tbStatuses.id))
      .innerJoin(tbModules, eq(tbTasks.moduleId, tbModules.id))
      .innerJoin(tbProjects, eq(tbModules.projectId, tbProjects.id))
      .where(eq(tbTasks.id, id))
      .limit(1);

    if (!row) throw AppException.notFound('task', id);

    const [detailed] = await this.attachDetails([this.serializeJoined(row)]);

    const subtasks = await this.db
      .select()
      .from(tbTasks)
      .where(eq(tbTasks.parentTaskId, id))
      .orderBy(asc(tbTasks.position));

    const comments = await this.db
      .select({
        id: tbTaskComments.id,
        body: tbTaskComments.body,
        userId: tbTaskComments.userId,
        createdAt: tbTaskComments.createdAt,
        userEmail: users.email,
      })
      .from(tbTaskComments)
      .leftJoin(users, eq(tbTaskComments.userId, users.id))
      .where(eq(tbTaskComments.taskId, id))
      .orderBy(asc(tbTaskComments.createdAt));

    return {
      ...detailed,
      subtasks: subtasks.map(this.serializeTask),
      comments: comments.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  async getAssignees() {
    return this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .orderBy(asc(users.email));
  }

  async create(dto: CreateTaskDto, userId: string) {
    const mod = await this.requireModule(dto.moduleId);

    if (dto.parentTaskId) {
      const parent = await this.requireTask(dto.parentTaskId);
      if (parent.moduleId !== dto.moduleId) {
        throw AppException.badRequest('Subtask must stay in the same module as its parent');
      }
    }

    let statusId = dto.statusId ?? null;
    if (!statusId) {
      const statuses = await this.statuses.findByModule(dto.moduleId);
      const backlog = statuses.find((s) => s.isBacklog) ?? statuses[0];
      statusId = backlog?.id ?? null;
    } else {
      await this.assertStatusForModule(dto.moduleId, statusId);
    }

    if (dto.leadId) {
      await this.assertLeadExists(dto.leadId);
    }
    if (dto.assigneeIds?.length) {
      await this.assertUsersExist(dto.assigneeIds);
    }

    const allocated = await this.allocateTaskNumber(mod.projectId);
    const canceledAt = statusId ? await this.resolveCanceledAt(null, statusId, null) : null;

    const [created] = await this.db
      .insert(tbTasks)
      .values({
        moduleId: dto.moduleId,
        statusId,
        parentTaskId: dto.parentTaskId ?? null,
        title: dto.title.trim(),
        description: dto.description ?? null,
        priority: dto.priority ?? 'medium',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        leadId: dto.leadId ?? null,
        canceledAt,
        createdBy: userId,
        position: 0,
        number: allocated.number,
        identifier: allocated.identifier,
      } as any)
      .returning();

    if (dto.assigneeIds?.length) {
      await this.setAssignees(created.id, dto.assigneeIds);
    }
    if (dto.tagIds?.length) {
      await this.setTags(created.id, dto.tagIds);
    }

    await this.logActivity(created.id, userId, 'task.created', null, created.title);

    this.events.emit('boards.task.created', {
      taskId: created.id,
      moduleId: created.moduleId,
      projectId: mod.projectId,
    });

    return this.findById(created.id);
  }

  async update(id: string, dto: UpdateTaskDto, userId: string) {
    const existing = await this.requireTask(id);

    let moduleChangedProject = false;
    let newProjectId: string | null = null;

    if (dto.moduleId && dto.moduleId !== existing.moduleId) {
      if (existing.parentTaskId) {
        throw AppException.badRequest('Subtask cannot change module independently');
      }
      const nextMod = await this.requireModule(dto.moduleId);
      const prevMod = await this.requireModule(existing.moduleId);
      if (nextMod.projectId !== prevMod.projectId) {
        moduleChangedProject = true;
        newProjectId = nextMod.projectId;
      }
    }

    const effectiveModuleId = dto.moduleId ?? existing.moduleId;
    if (dto.statusId) {
      await this.assertStatusForModule(effectiveModuleId, dto.statusId);
    } else if (dto.moduleId && existing.statusId) {
      // Module change without new status — existing status must still be valid.
      await this.assertStatusForModule(effectiveModuleId, existing.statusId);
    }

    if (dto.leadId) {
      await this.assertLeadExists(dto.leadId);
    }
    if (dto.assigneeIds?.length) {
      await this.assertUsersExist(dto.assigneeIds);
    }

    const rekeyed =
      moduleChangedProject && newProjectId ? await this.allocateTaskNumber(newProjectId) : null;

    const canceledAtPatch =
      dto.statusId !== undefined
        ? await this.resolveCanceledAt(existing.statusId, dto.statusId, existing.canceledAt)
        : undefined;

    const [updated] = await this.db
      .update(tbTasks)
      .set({
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.statusId !== undefined ? { statusId: dto.statusId } : {}),
        ...(dto.dueDate !== undefined
          ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }
          : {}),
        ...(dto.leadId !== undefined ? { leadId: dto.leadId } : {}),
        ...(dto.moduleId !== undefined ? { moduleId: dto.moduleId } : {}),
        ...(rekeyed ? { number: rekeyed.number, identifier: rekeyed.identifier } : {}),
        ...(canceledAtPatch !== undefined ? { canceledAt: canceledAtPatch } : {}),
        updatedAt: new Date(),
      } as any)
      .where(eq(tbTasks.id, id))
      .returning();

    if (dto.assigneeIds !== undefined) {
      await this.setAssignees(id, dto.assigneeIds);
      await this.logActivity(id, userId, 'assignees.updated', null, dto.assigneeIds.join(','));
    }
    if (dto.tagIds !== undefined) {
      await this.setTags(id, dto.tagIds);
    }
    if (dto.title !== undefined && dto.title !== existing.title) {
      await this.logActivity(id, userId, 'title.updated', existing.title, dto.title);
    }
    if (dto.priority !== undefined && dto.priority !== existing.priority) {
      await this.logActivity(id, userId, 'priority.updated', existing.priority, dto.priority);
    }
    if (dto.statusId !== undefined && dto.statusId !== existing.statusId) {
      await this.logActivity(id, userId, 'status.updated', existing.statusId, dto.statusId);
    }

    return this.findById(updated.id);
  }

  async updateStatus(id: string, statusId: string, position: number, userId: string) {
    const existing = await this.requireTask(id);
    await this.assertStatusForModule(existing.moduleId, statusId);

    const canceledAt = await this.resolveCanceledAt(
      existing.statusId,
      statusId,
      existing.canceledAt,
    );

    const [updated] = await this.db
      .update(tbTasks)
      .set({
        statusId,
        position,
        canceledAt,
        updatedAt: new Date(),
      } as any)
      .where(eq(tbTasks.id, id))
      .returning();

    await this.logActivity(id, userId, 'status.updated', existing.statusId, statusId);

    this.events.emit('boards.task.moved', {
      taskId: id,
      statusId,
      moduleId: updated.moduleId,
      position,
    });

    return this.serializeTask(updated);
  }

  async delete(id: string) {
    const existing = await this.requireTask(id);
    await this.db.delete(tbTasks).where(eq(tbTasks.id, id));
    this.events.emit('boards.task.deleted', {
      taskId: id,
      moduleId: existing.moduleId,
    });
  }

  /** Hard-delete tasks that have been in a canceled status for ≥ 7 days. */
  async purgeExpiredCanceled(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - CANCELED_TASK_RETENTION_MS);
    const expired = await this.db
      .select({ id: tbTasks.id, moduleId: tbTasks.moduleId })
      .from(tbTasks)
      .where(and(isNotNull(tbTasks.canceledAt), lt(tbTasks.canceledAt, cutoff)));

    if (expired.length === 0) return 0;

    await this.db.delete(tbTasks).where(
      inArray(
        tbTasks.id,
        expired.map((t) => t.id),
      ),
    );

    for (const row of expired) {
      this.events.emit('boards.task.deleted', {
        taskId: row.id,
        moduleId: row.moduleId,
      });
    }

    return expired.length;
  }

  async addComment(taskId: string, body: string, userId: string) {
    await this.requireTask(taskId);
    const [comment] = await this.db
      .insert(tbTaskComments)
      .values({ taskId, userId, body: body.trim() } as any)
      .returning();

    await this.logActivity(taskId, userId, 'comment.added', null, body.trim().slice(0, 200));

    return {
      ...comment,
      createdAt: comment.createdAt.toISOString(),
    };
  }

  async getActivity(taskId: string) {
    await this.requireTask(taskId);
    const rows = await this.db
      .select({
        id: tbTaskActivity.id,
        action: tbTaskActivity.action,
        oldValue: tbTaskActivity.oldValue,
        newValue: tbTaskActivity.newValue,
        userId: tbTaskActivity.userId,
        createdAt: tbTaskActivity.createdAt,
        userEmail: users.email,
      })
      .from(tbTaskActivity)
      .leftJoin(users, eq(tbTaskActivity.userId, users.id))
      .where(eq(tbTaskActivity.taskId, taskId))
      .orderBy(desc(tbTaskActivity.createdAt));

    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ─── helpers ───────────────────────────────────────────────────────────────

  private async allocateTaskNumber(projectId: string) {
    const [row] = await this.db
      .update(tbProjects)
      .set({
        taskSeq: sql`${tbProjects.taskSeq} + 1`,
        updatedAt: new Date(),
      } as any)
      .where(eq(tbProjects.id, projectId))
      .returning();
    if (!row) throw AppException.notFound('project', projectId);
    return {
      number: row.taskSeq as number,
      identifier: formatTaskIdentifier(row.key, row.taskSeq),
    };
  }

  private async requireModule(id: string) {
    const [mod] = await this.db.select().from(tbModules).where(eq(tbModules.id, id)).limit(1);
    if (!mod) throw AppException.notFound('module', id);
    return mod;
  }

  private async requireTask(id: string) {
    const [task] = await this.db.select().from(tbTasks).where(eq(tbTasks.id, id)).limit(1);
    if (!task) throw AppException.notFound('task', id);
    return task;
  }

  /** Status must be in the module's board (module-owned or inherited project statuses). */
  private async assertStatusForModule(moduleId: string, statusId: string) {
    const allowed = await this.statuses.findByModule(moduleId);
    if (!allowed.some((s) => s.id === statusId)) {
      throw AppException.badRequest('Status does not belong to this module board');
    }
  }

  /**
   * Entering canceled starts (or keeps) the 7-day clock; leaving clears it.
   * Re-entering canceled after leaving starts a fresh clock.
   */
  private async resolveCanceledAt(
    previousStatusId: string | null,
    nextStatusId: string | null,
    previousCanceledAt: Date | null,
  ): Promise<Date | null> {
    if (!nextStatusId) return null;
    const next = await this.statuses.findById(nextStatusId);
    if (!next.isCanceled) return null;

    if (previousStatusId) {
      try {
        const prev = await this.statuses.findById(previousStatusId);
        if (prev.isCanceled) return previousCanceledAt ?? new Date();
      } catch {
        // previous status missing — treat as fresh cancel
      }
    }
    return new Date();
  }

  private async assertLeadExists(leadId: string) {
    const [row] = await this.db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    if (!row) throw AppException.notFound('lead', leadId);
  }

  private async assertUsersExist(userIds: string[]) {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, userIds));
    if (rows.length !== userIds.length) {
      throw AppException.badRequest('One or more assignees do not exist');
    }
  }

  private async setAssignees(taskId: string, userIds: string[]) {
    await this.db.delete(tbTaskAssignees).where(eq(tbTaskAssignees.taskId, taskId));
    if (userIds.length === 0) return;
    await this.db
      .insert(tbTaskAssignees)
      .values(userIds.map((userId) => ({ taskId, userId })) as any);
  }

  private async setTags(taskId: string, tagIds: string[]) {
    await this.db.delete(tbTaskTags).where(eq(tbTaskTags.taskId, taskId));
    if (tagIds.length === 0) return;
    await this.db.insert(tbTaskTags).values(tagIds.map((tagId) => ({ taskId, tagId })) as any);
  }

  private async logActivity(
    taskId: string,
    userId: string | null,
    action: string,
    oldValue: string | null,
    newValue: string | null,
  ) {
    await this.db.insert(tbTaskActivity).values({
      taskId,
      userId,
      action,
      oldValue,
      newValue,
    } as any);
  }

  private serializeTask = (task: typeof tbTasks.$inferSelect) => ({
    ...task,
    dueDate: task.dueDate?.toISOString() ?? null,
    canceledAt: task.canceledAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  });

  private serializeJoined(row: {
    task: typeof tbTasks.$inferSelect;
    status: typeof tbStatuses.$inferSelect | null;
    module: typeof tbModules.$inferSelect;
    project: typeof tbProjects.$inferSelect;
  }) {
    return {
      ...this.serializeTask(row.task),
      status: row.status
        ? {
            id: row.status.id,
            name: row.status.name,
            color: row.status.color,
            isBacklog: row.status.isBacklog,
            isDone: row.status.isDone,
            isCanceled: row.status.isCanceled,
          }
        : null,
      module: { id: row.module.id, name: row.module.name, projectId: row.module.projectId },
      project: {
        id: row.project.id,
        name: row.project.name,
        color: row.project.color,
        key: row.project.key,
      },
    };
  }

  private async attachDetails<T extends { id: string }>(tasks: T[]) {
    if (tasks.length === 0)
      return tasks as Array<
        T & {
          assignees: Array<{ id: string; email: string }>;
          tags: Array<{ id: string; name: string; color: string }>;
          commentCount: number;
          subtaskCount: number;
        }
      >;

    const ids = tasks.map((t) => t.id);

    const assignees = await this.db
      .select({
        taskId: tbTaskAssignees.taskId,
        id: users.id,
        email: users.email,
      })
      .from(tbTaskAssignees)
      .innerJoin(users, eq(tbTaskAssignees.userId, users.id))
      .where(inArray(tbTaskAssignees.taskId, ids));

    const tags = await this.db
      .select({
        taskId: tbTaskTags.taskId,
        id: tbTags.id,
        name: tbTags.name,
        color: tbTags.color,
      })
      .from(tbTaskTags)
      .innerJoin(tbTags, eq(tbTaskTags.tagId, tbTags.id))
      .where(inArray(tbTaskTags.taskId, ids));

    const commentCounts = await this.db
      .select({
        taskId: tbTaskComments.taskId,
        count: sql<number>`count(*)::int`,
      })
      .from(tbTaskComments)
      .where(inArray(tbTaskComments.taskId, ids))
      .groupBy(tbTaskComments.taskId);

    const subtaskCounts = await this.db
      .select({
        parentId: tbTasks.parentTaskId,
        count: sql<number>`count(*)::int`,
      })
      .from(tbTasks)
      .where(inArray(tbTasks.parentTaskId, ids))
      .groupBy(tbTasks.parentTaskId);

    const assigneesByTask = new Map<string, Array<{ id: string; email: string }>>();
    for (const a of assignees) {
      const list = assigneesByTask.get(a.taskId) ?? [];
      list.push({ id: a.id, email: a.email });
      assigneesByTask.set(a.taskId, list);
    }

    const tagsByTask = new Map<string, Array<{ id: string; name: string; color: string }>>();
    for (const t of tags) {
      const list = tagsByTask.get(t.taskId) ?? [];
      list.push({ id: t.id, name: t.name, color: t.color });
      tagsByTask.set(t.taskId, list);
    }

    const commentsByTask = new Map(commentCounts.map((c) => [c.taskId, c.count]));
    const subtasksByTask = new Map(
      subtaskCounts.filter((s) => s.parentId).map((s) => [s.parentId!, s.count]),
    );

    return tasks.map((t) => ({
      ...t,
      assignees: assigneesByTask.get(t.id) ?? [],
      tags: tagsByTask.get(t.id) ?? [],
      commentCount: commentsByTask.get(t.id) ?? 0,
      subtaskCount: subtasksByTask.get(t.id) ?? 0,
    }));
  }
}
