import { Injectable, Inject } from '@nestjs/common';
import { lockMutation, type Connection } from '../../../core/database/transaction';
import { eq, asc, sql } from 'drizzle-orm';
import { tbProjects, tbModules, tbStatuses } from '../../../core/database/schema';
import { deriveProjectKey, normalizeProjectKey } from '../task-key';
import { DB_TOKEN } from '../../../core/database/database.module';
import type { Db } from '../../../core/database/db';
import { AppException } from '../../../core/errors/app-exception';

export interface CreateProjectDto {
  name: string;
  description?: string;
  color?: string;
  /** Optional short key (FIN, BEAR). Auto-derived from name when omitted. */
  key?: string;
}

export interface UpdateProjectDto {
  name?: string;
  description?: string | null;
  color?: string;
  key?: string;
}

const DEFAULT_STATUSES = [
  {
    name: 'Backlog',
    color: '#8F949C',
    position: 0,
    isBacklog: true,
    isDone: false,
    isCanceled: false,
  },
  {
    name: 'To do',
    color: '#6F95C9',
    position: 1,
    isBacklog: false,
    isDone: false,
    isCanceled: false,
  },
  {
    name: 'In progress',
    color: '#D7A445',
    position: 2,
    isBacklog: false,
    isDone: false,
    isCanceled: false,
  },
  {
    name: 'Done',
    color: '#74B98A',
    position: 3,
    isBacklog: false,
    isDone: true,
    isCanceled: false,
  },
  {
    name: 'Canceled',
    color: '#E06055',
    position: 4,
    isBacklog: false,
    isDone: false,
    isCanceled: true,
  },
];

@Injectable()
export class ProjectsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async findAll() {
    return this.db.select().from(tbProjects).orderBy(asc(tbProjects.createdAt));
  }

  async findById(id: string, db: Connection = this.db) {
    const [row] = await db.select().from(tbProjects).where(eq(tbProjects.id, id)).limit(1);
    if (!row) throw AppException.notFound('project', id);
    return row;
  }

  async create(dto: CreateProjectDto, userId: string) {
    return this.db.transaction(async (tx) => {
      await lockMutation(tx, 'boards');
      return this.createInTransaction(dto, userId, tx);
    });
  }

  private async createInTransaction(dto: CreateProjectDto, userId: string, db: Connection) {
    const key = await this.resolveUniqueKey(dto.key ?? deriveProjectKey(dto.name), db);

    const [project] = await db
      .insert(tbProjects)
      .values({
        name: dto.name.trim(),
        description: dto.description ?? null,
        color: dto.color ?? '#6366f1',
        key,
        taskSeq: 0,
        createdBy: userId,
      } as any)
      .returning();

    // Default "Backlog" module
    const [mod] = await db
      .insert(tbModules)
      .values({
        projectId: project.id,
        name: 'Backlog',
        position: 0,
      } as any)
      .returning();

    // Default project-level statuses
    for (const s of DEFAULT_STATUSES) {
      await db.insert(tbStatuses).values({
        projectId: project.id,
        moduleId: null,
        name: s.name,
        color: s.color,
        position: s.position,
        isBacklog: s.isBacklog,
        isDone: s.isDone,
        isCanceled: s.isCanceled,
      } as any);
    }

    return { ...project, defaultModuleId: mod.id };
  }

  async update(id: string, dto: UpdateProjectDto) {
    return this.db.transaction(async (tx) => {
      await lockMutation(tx, 'boards');
      return this.updateInTransaction(id, dto, tx);
    });
  }

  private async updateInTransaction(id: string, dto: UpdateProjectDto, db: Connection) {
    const existing = await this.findById(id, db);
    let nextKey = existing.key;

    if (dto.key !== undefined) {
      const normalized = normalizeProjectKey(dto.key);
      if (normalized.length < 2) {
        throw AppException.badRequest('Project key must be at least 2 characters (A–Z, 0–9)');
      }
      if (normalized !== existing.key) {
        await this.assertKeyAvailable(normalized, id, db);
        nextKey = normalized;
      }
    }

    const [updated] = await db
      .update(tbProjects)
      .set({
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(nextKey !== existing.key ? { key: nextKey } : {}),
        updatedAt: new Date(),
      } as any)
      .where(eq(tbProjects.id, id))
      .returning();

    if (nextKey !== existing.key) {
      await this.rewriteTaskIdentifiers(id, nextKey, db);
    }

    return updated;
  }

  async delete(id: string) {
    await this.findById(id);
    await this.db.delete(tbProjects).where(eq(tbProjects.id, id));
  }

  private async rewriteTaskIdentifiers(projectId: string, key: string, db: Connection = this.db) {
    await db.execute(sql`
      UPDATE tb_tasks AS t
      SET identifier = ${key} || '-' || lpad(t.number::text, greatest(2, length(t.number::text)), '0')
      FROM tb_modules AS m
      WHERE m.id = t.module_id AND m.project_id = ${projectId} AND t.number IS NOT NULL
    `);
  }

  private async resolveUniqueKey(raw: string, db: Connection = this.db): Promise<string> {
    let base = normalizeProjectKey(raw);
    if (base.length < 2) base = 'PRJ';
    base = base.slice(0, 6);

    let candidate = base;
    let n = 2;
    while (await this.keyTaken(candidate, db)) {
      const suffix = String(n);
      candidate = `${base.slice(0, Math.max(1, 6 - suffix.length))}${suffix}`;
      n += 1;
      if (n > 99) {
        candidate = `P${Date.now().toString(36).toUpperCase().slice(-5)}`;
        break;
      }
    }
    return candidate;
  }

  private async assertKeyAvailable(
    key: string,
    exceptProjectId?: string,
    db: Connection = this.db,
  ) {
    const [row] = await db
      .select({ id: tbProjects.id })
      .from(tbProjects)
      .where(eq(tbProjects.key, key))
      .limit(1);
    if (row && row.id !== exceptProjectId) {
      throw AppException.badRequest(`Project key "${key}" is already in use`);
    }
  }

  private async keyTaken(key: string, db: Connection = this.db): Promise<boolean> {
    const [row] = await db
      .select({ id: tbProjects.id })
      .from(tbProjects)
      .where(eq(tbProjects.key, key))
      .limit(1);
    return Boolean(row);
  }
}
