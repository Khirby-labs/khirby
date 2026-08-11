import { Injectable, Inject } from '@nestjs/common';
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

  async findByProject(projectId: string) {
    return this.db
      .select()
      .from(tbStatuses)
      .where(eq(tbStatuses.projectId, projectId))
      .orderBy(asc(tbStatuses.position));
  }

  async findByModule(moduleId: string) {
    const mod = await this.getModule(moduleId);
    const moduleStatuses = await this.db
      .select()
      .from(tbStatuses)
      .where(eq(tbStatuses.moduleId, moduleId))
      .orderBy(asc(tbStatuses.position));

    if (moduleStatuses.length > 0) return moduleStatuses;

    return this.findByProject(mod.projectId);
  }

  async findById(id: string) {
    const [row] = await this.db.select().from(tbStatuses).where(eq(tbStatuses.id, id)).limit(1);
    if (!row) throw AppException.notFound('status', id);
    return row;
  }

  async create(dto: CreateStatusDto) {
    if (!dto.projectId && !dto.moduleId) {
      throw AppException.badRequest('Status requires projectId or moduleId');
    }
    if (dto.projectId && dto.moduleId) {
      throw AppException.badRequest('Status cannot belong to both project and module');
    }
    this.assertExclusiveFlags(dto);

    if (dto.projectId) {
      const [p] = await this.db
        .select()
        .from(tbProjects)
        .where(eq(tbProjects.id, dto.projectId))
        .limit(1);
      if (!p) throw AppException.notFound('project', dto.projectId);
    }
    if (dto.moduleId) {
      await this.getModule(dto.moduleId);
    }

    const siblings = dto.projectId
      ? await this.findByProject(dto.projectId)
      : await this.db.select().from(tbStatuses).where(eq(tbStatuses.moduleId, dto.moduleId!));

    const [row] = await this.db
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
      await this.clearExclusiveFlags(row, {
        isBacklog: !!dto.isBacklog,
        isDone: !!dto.isDone,
        isCanceled: !!dto.isCanceled,
      });
    }

    return this.findById(row!.id);
  }

  async update(id: string, dto: UpdateStatusDto) {
    await this.findById(id);
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

    const [updated] = await this.db
      .update(tbStatuses)
      .set(patch as any)
      .where(eq(tbStatuses.id, id))
      .returning();

    if (!updated) throw AppException.notFound('status', id);

    if (updated.isBacklog || updated.isDone || updated.isCanceled) {
      await this.clearExclusiveFlags(updated, {
        isBacklog: updated.isBacklog,
        isDone: updated.isDone,
        isCanceled: updated.isCanceled,
      });
      return this.findById(id);
    }

    return updated;
  }

  async reorder(ids: string[], scope: { projectId?: string; moduleId?: string }) {
    if (!scope.projectId && !scope.moduleId) {
      throw AppException.badRequest('Status reorder requires projectId or moduleId');
    }
    if (scope.projectId && scope.moduleId) {
      throw AppException.badRequest('Pass either projectId or moduleId, not both');
    }

    const existing = scope.moduleId
      ? await this.db.select().from(tbStatuses).where(eq(tbStatuses.moduleId, scope.moduleId))
      : await this.findByProject(scope.projectId!);

    if (ids.length !== existing.length || !ids.every((id) => existing.some((s) => s.id === id))) {
      throw AppException.badRequest('ids must include all statuses in the scope');
    }

    for (let i = 0; i < ids.length; i++) {
      await this.db
        .update(tbStatuses)
        .set({ position: i } as any)
        .where(eq(tbStatuses.id, ids[i]));
    }

    return scope.projectId
      ? this.findByProject(scope.projectId)
      : this.db
          .select()
          .from(tbStatuses)
          .where(eq(tbStatuses.moduleId, scope.moduleId!))
          .orderBy(asc(tbStatuses.position));
  }

  async delete(id: string) {
    const existing = await this.findById(id);
    const siblings = existing.projectId
      ? await this.findByProject(existing.projectId)
      : existing.moduleId
        ? await this.db.select().from(tbStatuses).where(eq(tbStatuses.moduleId, existing.moduleId))
        : [];

    if (siblings.length <= 1) {
      throw AppException.badRequest('Cannot delete the last status');
    }

    const [inUse] = await this.db
      .select({ id: tbTasks.id })
      .from(tbTasks)
      .where(eq(tbTasks.statusId, id))
      .limit(1);
    if (inUse) {
      throw AppException.badRequest('Status is in use by tasks');
    }
    await this.db.delete(tbStatuses).where(eq(tbStatuses.id, id));
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
  ) {
    const siblings = status.projectId
      ? await this.findByProject(status.projectId)
      : status.moduleId
        ? await this.db.select().from(tbStatuses).where(eq(tbStatuses.moduleId, status.moduleId))
        : [];

    for (const s of siblings) {
      if (s.id === status.id) continue;
      const patch: { isBacklog?: boolean; isDone?: boolean; isCanceled?: boolean } = {};
      if (flags.isBacklog && s.isBacklog) patch.isBacklog = false;
      if (flags.isDone && s.isDone) patch.isDone = false;
      if (flags.isCanceled && s.isCanceled) patch.isCanceled = false;
      if (Object.keys(patch).length === 0) continue;
      await this.db
        .update(tbStatuses)
        .set(patch as any)
        .where(eq(tbStatuses.id, s.id));
    }
  }

  private async getModule(id: string) {
    const [mod] = await this.db.select().from(tbModules).where(eq(tbModules.id, id)).limit(1);
    if (!mod) throw AppException.notFound('module', id);
    return mod;
  }
}
