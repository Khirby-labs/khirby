import { Injectable, Inject } from '@nestjs/common';
import { lockMutation, type Connection } from '../../../core/database/transaction';
import { eq, asc } from 'drizzle-orm';
import { tbStatuses, tbTasks, tbModules, tbProjects } from '../../../core/database/schema';
import { DB_TOKEN } from '../../../core/database/database.module';
import type { Db } from '../../../core/database/db';
import { AppException } from '../../../core/errors/app-exception';

export interface CreateStatusDto {
  projectId?: string;
  moduleId?: string;
  name: string;
  color?: string;
  position?: number;
  isBacklog?: boolean;
  isDone?: boolean;
  isCanceled?: boolean;
}

export interface UpdateStatusDto {
  name?: string;
  color?: string;
  isBacklog?: boolean;
  isDone?: boolean;
  isCanceled?: boolean;
}

@Injectable()
export class StatusesService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async findByProject(projectId: string, db: Connection = this.db) {
    return db
      .select()
      .from(tbStatuses)
      .where(eq(tbStatuses.projectId, projectId))
      .orderBy(asc(tbStatuses.position));
  }

  async findByModule(moduleId: string, db: Connection = this.db) {
    const mod = await this.getModule(moduleId, db);
    const moduleStatuses = await db
      .select()
      .from(tbStatuses)
      .where(eq(tbStatuses.moduleId, moduleId))
      .orderBy(asc(tbStatuses.position));

    if (moduleStatuses.length > 0) return moduleStatuses;

    return this.findByProject(mod.projectId, db);
  }

  async findById(id: string, db: Connection = this.db) {
    const [row] = await db.select().from(tbStatuses).where(eq(tbStatuses.id, id)).limit(1);
    if (!row) throw AppException.notFound('status', id);
    return row;
  }

  async create(dto: CreateStatusDto) {
    return this.db.transaction(async (tx) => {
      await lockMutation(tx, 'boards');
      return this.createInTransaction(dto, tx);
    });
  }

  private async createInTransaction(dto: CreateStatusDto, db: Connection) {
    if (!dto.projectId && !dto.moduleId) {
      throw AppException.badRequest('Status requires projectId or moduleId');
    }
    if (dto.projectId && dto.moduleId) {
      throw AppException.badRequest('Status cannot belong to both project and module');
    }
    this.assertExclusiveFlags(dto);

    if (dto.projectId) {
      const [p] = await db
        .select()
        .from(tbProjects)
        .where(eq(tbProjects.id, dto.projectId))
        .limit(1);
      if (!p) throw AppException.notFound('project', dto.projectId);
    }
    if (dto.moduleId) {
      await this.getModule(dto.moduleId, db);
    }

    const siblings = dto.projectId
      ? await this.findByProject(dto.projectId, db)
      : await db.select().from(tbStatuses).where(eq(tbStatuses.moduleId, dto.moduleId!));

    const [row] = await db
      .insert(tbStatuses)
      .values({
        projectId: dto.projectId ?? null,
        moduleId: dto.moduleId ?? null,
        name: dto.name.trim(),
        color: dto.color ?? '#8F949C',
        position: dto.position ?? siblings.length,
        isBacklog: dto.isBacklog ?? false,
        isDone: dto.isDone ?? false,
        isCanceled: dto.isCanceled ?? false,
      } as any)
      .returning();

    if (row && (dto.isBacklog || dto.isDone || dto.isCanceled)) {
      await this.clearExclusiveFlags(
        row,
        {
          isBacklog: !!dto.isBacklog,
          isDone: !!dto.isDone,
          isCanceled: !!dto.isCanceled,
        },
        db,
      );
    }

    return this.findById(row!.id, db);
  }

  async update(id: string, dto: UpdateStatusDto) {
    return this.db.transaction(async (tx) => {
      await lockMutation(tx, 'boards');
      return this.updateInTransaction(id, dto, tx);
    });
  }

  private async updateInTransaction(id: string, dto: UpdateStatusDto, db: Connection) {
    const existing = await this.findById(id, db);
    this.assertExclusiveFlags(dto);

    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.color !== undefined) patch.color = dto.color;
    if (dto.isBacklog !== undefined) patch.isBacklog = dto.isBacklog;
    if (dto.isDone !== undefined) patch.isDone = dto.isDone;
    if (dto.isCanceled !== undefined) patch.isCanceled = dto.isCanceled;

    if (dto.isBacklog === true) {
      patch.isDone = false;
      patch.isCanceled = false;
    }
    if (dto.isDone === true) {
      patch.isBacklog = false;
      patch.isCanceled = false;
    }
    if (dto.isCanceled === true) {
      patch.isBacklog = false;
      patch.isDone = false;
    }

    const [updated] = await db
      .update(tbStatuses)
      .set(patch as any)
      .where(eq(tbStatuses.id, id))
      .returning();

    if (!updated) throw AppException.notFound('status', id);
    if (existing.isCanceled !== updated.isCanceled) {
      await db
        .update(tbTasks)
        .set({ canceledAt: updated.isCanceled ? new Date() : null } as any)
        .where(eq(tbTasks.statusId, id));
    }

    if (updated.isBacklog || updated.isDone || updated.isCanceled) {
      await this.clearExclusiveFlags(
        updated,
        {
          isBacklog: updated.isBacklog,
          isDone: updated.isDone,
          isCanceled: updated.isCanceled,
        },
        db,
      );
      return this.findById(id, db);
    }

    return updated;
  }

  async reorder(ids: string[], scope: { projectId?: string; moduleId?: string }) {
    return this.db.transaction(async (tx) => {
      await lockMutation(tx, 'boards');
      return this.reorderInTransaction(ids, scope, tx);
    });
  }

  private async reorderInTransaction(
    ids: string[],
    scope: { projectId?: string; moduleId?: string },
    db: Connection,
  ) {
    if (!scope.projectId && !scope.moduleId) {
      throw AppException.badRequest('Status reorder requires projectId or moduleId');
    }
    if (scope.projectId && scope.moduleId) {
      throw AppException.badRequest('Pass either projectId or moduleId, not both');
    }

    const existing = scope.moduleId
      ? await db.select().from(tbStatuses).where(eq(tbStatuses.moduleId, scope.moduleId))
      : await this.findByProject(scope.projectId!, db);

    if (
      new Set(ids).size !== ids.length ||
      ids.length !== existing.length ||
      !ids.every((id) => existing.some((s) => s.id === id))
    ) {
      throw AppException.badRequest('ids must include all statuses in the scope');
    }

    for (let i = 0; i < ids.length; i++) {
      await db
        .update(tbStatuses)
        .set({ position: i } as any)
        .where(eq(tbStatuses.id, ids[i]));
    }

    return scope.projectId
      ? this.findByProject(scope.projectId, db)
      : db
          .select()
          .from(tbStatuses)
          .where(eq(tbStatuses.moduleId, scope.moduleId!))
          .orderBy(asc(tbStatuses.position));
  }

  async delete(id: string) {
    return this.db.transaction(async (tx) => {
      await lockMutation(tx, 'boards');
      return this.deleteInTransaction(id, tx);
    });
  }

  private async deleteInTransaction(id: string, db: Connection) {
    const existing = await this.findById(id, db);
    const siblings = existing.projectId
      ? await this.findByProject(existing.projectId, db)
      : existing.moduleId
        ? await db.select().from(tbStatuses).where(eq(tbStatuses.moduleId, existing.moduleId))
        : [];

    if (siblings.length <= 1) {
      throw AppException.badRequest('Cannot delete the last status');
    }

    const [inUse] = await db
      .select({ id: tbTasks.id })
      .from(tbTasks)
      .where(eq(tbTasks.statusId, id))
      .limit(1);
    if (inUse) {
      throw AppException.badRequest('Status is in use by tasks');
    }
    await db.delete(tbStatuses).where(eq(tbStatuses.id, id));
  }

  private assertExclusiveFlags(dto: {
    isBacklog?: boolean;
    isDone?: boolean;
    isCanceled?: boolean;
  }) {
    const flags = [dto.isBacklog, dto.isDone, dto.isCanceled].filter(Boolean).length;
    if (flags > 1) {
      throw AppException.badRequest('Status can be only one of backlog, done, or canceled');
    }
  }

  private async clearExclusiveFlags(
    status: { id: string; projectId: string | null; moduleId: string | null },
    flags: { isBacklog: boolean; isDone: boolean; isCanceled: boolean },
    db: Connection = this.db,
  ) {
    const siblings = status.projectId
      ? await this.findByProject(status.projectId, db)
      : status.moduleId
        ? await db.select().from(tbStatuses).where(eq(tbStatuses.moduleId, status.moduleId))
        : [];

    for (const s of siblings) {
      if (s.id === status.id) continue;
      const patch: { isBacklog?: boolean; isDone?: boolean; isCanceled?: boolean } = {};
      if (flags.isBacklog && s.isBacklog) patch.isBacklog = false;
      if (flags.isDone && s.isDone) patch.isDone = false;
      if (flags.isCanceled && s.isCanceled) patch.isCanceled = false;
      if (Object.keys(patch).length === 0) continue;
      await db
        .update(tbStatuses)
        .set(patch as any)
        .where(eq(tbStatuses.id, s.id));
      if (patch.isCanceled === false) {
        await db
          .update(tbTasks)
          .set({ canceledAt: null } as any)
          .where(eq(tbTasks.statusId, s.id));
      }
    }
  }

  private async getModule(id: string, db: Connection = this.db) {
    const [mod] = await db.select().from(tbModules).where(eq(tbModules.id, id)).limit(1);
    if (!mod) throw AppException.notFound('module', id);
    return mod;
  }
}
