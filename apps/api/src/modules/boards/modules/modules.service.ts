import { Injectable, Inject } from '@nestjs/common';
import { eq, asc, and } from 'drizzle-orm';
import { tbModules, tbProjects } from '../../../core/database/schema';
import { DB_TOKEN } from '../../../core/database/database.module';
import type { Db } from '../../../core/database/db';
import { AppException } from '../../../core/errors/app-exception';

export interface CreateModuleDto {
  projectId: string;
  name: string;
  description?: string;
  position?: number;
}

export interface UpdateModuleDto {
  name?: string;
  description?: string | null;
}

@Injectable()
export class ModulesService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async findByProject(projectId: string) {
    return this.db
      .select()
      .from(tbModules)
      .where(eq(tbModules.projectId, projectId))
      .orderBy(asc(tbModules.position));
  }

  async findById(id: string) {
    const [row] = await this.db.select().from(tbModules).where(eq(tbModules.id, id)).limit(1);
    if (!row) throw AppException.notFound('module', id);
    return row;
  }

  async create(dto: CreateModuleDto) {
    const [project] = await this.db
      .select()
      .from(tbProjects)
      .where(eq(tbProjects.id, dto.projectId))
      .limit(1);
    if (!project) throw AppException.notFound('project', dto.projectId);

    const existing = await this.findByProject(dto.projectId);
    const position = dto.position ?? existing.length;

    const [row] = await this.db
      .insert(tbModules)
      .values({
        projectId: dto.projectId,
        name: dto.name.trim(),
        description: dto.description ?? null,
        position,
      } as any)
      .returning();
    return row;
  }

  async update(id: string, dto: UpdateModuleDto) {
    await this.findById(id);
    const [updated] = await this.db
      .update(tbModules)
      .set({
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      } as any)
      .where(eq(tbModules.id, id))
      .returning();
    return updated;
  }

  async delete(id: string) {
    await this.findById(id);
    await this.db.delete(tbModules).where(eq(tbModules.id, id));
  }

  async reorder(projectId: string, ids: string[]) {
    const existing = await this.findByProject(projectId);
    if (ids.length !== existing.length || !ids.every((id) => existing.some((m) => m.id === id))) {
      throw AppException.badRequest('ids must include all modules of the project');
    }
    for (let i = 0; i < ids.length; i++) {
      await this.db
        .update(tbModules)
        .set({ position: i } as any)
        .where(and(eq(tbModules.id, ids[i]), eq(tbModules.projectId, projectId)));
    }
  }
}
