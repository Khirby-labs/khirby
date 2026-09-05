import { Injectable, Inject } from '@nestjs/common';
import { lockMutation, type Connection } from '../../core/database/transaction';
import { eq, asc, inArray, sql } from 'drizzle-orm';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import { pipelineStages, leads } from '../../core/database/schema';
import { CreatePipelineStageDto } from './dto/create-pipeline-stage.dto';
import { UpdatePipelineStageDto } from './dto/update-pipeline-stage.dto';
import { AppException } from '../../core/errors/app-exception';
// Relative import (like permission-catalog): `nest build` is plain tsc, so a bare
// '@khirby/types' specifier would survive into dist and fail at runtime.
import { DEFAULT_PIPELINE_STAGE_NAMES } from '../../../../../packages/types/src';

/*
 * The seed names are shared with the SPA (ADR-0011), which localizes a stage only
 * while its stored name still matches one of them. Taking them from the shared
 * constant rather than re-typing them here is what keeps that lookup honest.
 */
const [NEW_LEAD, MEETING_SET, NEGOTIATION, WON, LOST] = DEFAULT_PIPELINE_STAGE_NAMES;

/** Stage palette tuned for graphite surfaces — keep in sync with docs/DESIGN-SYSTEM.md §2.6 */
const DEFAULT_STAGES = [
  { name: NEW_LEAD, color: '#6F95C9', position: 0, isWon: false, isLost: false },
  { name: MEETING_SET, color: '#D7A445', position: 1, isWon: false, isLost: false },
  { name: NEGOTIATION, color: '#DD8046', position: 2, isWon: false, isLost: false },
  { name: WON, color: '#74B98A', position: 3, isWon: true, isLost: false },
  { name: LOST, color: '#E06055', position: 4, isWon: false, isLost: true },
];

@Injectable()
export class PipelineStagesService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async ensureDefaults() {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(48492001)`);

      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(pipelineStages);

      if (count === 0) {
        await tx.insert(pipelineStages).values(DEFAULT_STAGES as any);
      }
    });
  }

  async findAll(db: Connection = this.db) {
    return db.select().from(pipelineStages).orderBy(asc(pipelineStages.position));
  }

  async findById(id: string, db: Connection = this.db) {
    const [stage] = await db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.id, id))
      .limit(1);
    return stage ?? null;
  }

  async getFirstStage(db: Connection = this.db) {
    const [stage] = await db
      .select()
      .from(pipelineStages)
      .orderBy(asc(pipelineStages.position))
      .limit(1);
    if (!stage) throw AppException.notFound('pipelineStage');
    return stage;
  }

  async create(dto: CreatePipelineStageDto) {
    return this.db.transaction(async (tx) => {
      await lockMutation(tx, 'pipeline');
      return this.createInTransaction(dto, tx);
    });
  }

  private async createInTransaction(dto: CreatePipelineStageDto, db: Connection) {
    const all = await this.findAll(db);
    const position = dto.position ?? Math.max(-1, ...all.map((stage) => stage.position)) + 1;

    const [created] = await db
      .insert(pipelineStages)
      .values({
        name: dto.name,
        color: dto.color,
        position,
        isWon: dto.isWon ?? false,
        isLost: dto.isLost ?? false,
      } as any)
      .returning();
    return created;
  }

  async update(id: string, dto: UpdatePipelineStageDto) {
    return this.db.transaction(async (tx) => {
      await lockMutation(tx, 'pipeline');
      return this.updateInTransaction(id, dto, tx);
    });
  }

  private async updateInTransaction(id: string, dto: UpdatePipelineStageDto, db: Connection) {
    const existing = await this.findById(id, db);
    if (!existing) throw AppException.notFound('pipelineStage', id);

    const [updated] = await db
      .update(pipelineStages)
      .set(dto as any)
      .where(eq(pipelineStages.id, id))
      .returning();
    return updated;
  }

  async reorder(stageIds: string[]) {
    return this.db.transaction(async (tx) => {
      await lockMutation(tx, 'pipeline');
      return this.reorderInTransaction(stageIds, tx);
    });
  }

  private async reorderInTransaction(stageIds: string[], db: Connection) {
    const all = await this.findAll(db);
    if (stageIds.length !== all.length) {
      throw AppException.badRequest('stageIds must include all stages');
    }

    const idSet = new Set(stageIds);
    if (idSet.size !== stageIds.length) {
      throw AppException.badRequest('Duplicate stage IDs');
    }

    for (const stage of all) {
      if (!idSet.has(stage.id)) {
        throw AppException.badRequest('Unknown stage ID in reorder list');
      }
    }

    for (let i = 0; i < stageIds.length; i++) {
      await db
        .update(pipelineStages)
        .set({ position: i } as any)
        .where(eq(pipelineStages.id, stageIds[i]));
    }

    return this.findAll(db);
  }

  async delete(id: string) {
    return this.db.transaction(async (tx) => {
      await lockMutation(tx, 'pipeline');
      return this.deleteInTransaction(id, tx);
    });
  }

  private async deleteInTransaction(id: string, db: Connection) {
    const existing = await this.findById(id, db);
    if (!existing) throw AppException.notFound('pipelineStage', id);

    const firstStage = await this.getFirstStage(db);
    if (firstStage.id === id) {
      throw AppException.badRequest('Cannot delete the first pipeline stage');
    }

    await db
      .update(leads)
      .set({ stageId: firstStage.id, updatedAt: new Date() } as any)
      .where(eq(leads.stageId, id));

    await db.delete(pipelineStages).where(eq(pipelineStages.id, id));
    return { deleted: true };
  }

  async findByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return this.db.select().from(pipelineStages).where(inArray(pipelineStages.id, ids));
  }
}
