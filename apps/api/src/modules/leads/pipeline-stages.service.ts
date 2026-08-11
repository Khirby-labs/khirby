import { Injectable, Inject } from '@nestjs/common';
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

    await this.dedupeDuplicateStages();
  }

  /** Removes duplicate stages (same position) — e.g. from a concurrent seed race. */
  async dedupeDuplicateStages() {
    const all = await this.findAll();
    const canonicalByPosition = new Map<number, string>();

    for (const stage of all) {
      const keptId = canonicalByPosition.get(stage.position);
      if (!keptId) {
        canonicalByPosition.set(stage.position, stage.id);
        continue;
      }

      await this.db
        .update(leads)
        .set({ stageId: keptId, updatedAt: new Date() } as any)
        .where(eq(leads.stageId, stage.id));

      await this.db.delete(pipelineStages).where(eq(pipelineStages.id, stage.id));
    }
  }

  async findAll() {
    return this.db.select().from(pipelineStages).orderBy(asc(pipelineStages.position));
  }

  async findById(id: string) {
    const [stage] = await this.db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.id, id))
      .limit(1);
    return stage ?? null;
  }

  async getFirstStage() {
    const [stage] = await this.db
      .select()
      .from(pipelineStages)
      .orderBy(asc(pipelineStages.position))
      .limit(1);
    if (!stage) throw AppException.notFound('pipelineStage');
    return stage;
  }

  async create(dto: CreatePipelineStageDto) {
    const all = await this.findAll();
    const position = dto.position ?? all.length;

    const [created] = await this.db
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
    const existing = await this.findById(id);
    if (!existing) throw AppException.notFound('pipelineStage', id);

    const [updated] = await this.db
      .update(pipelineStages)
      .set(dto as any)
      .where(eq(pipelineStages.id, id))
      .returning();
    return updated;
  }

  async reorder(stageIds: string[]) {
    const all = await this.findAll();
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
      await this.db
        .update(pipelineStages)
        .set({ position: i } as any)
        .where(eq(pipelineStages.id, stageIds[i]));
    }

    return this.findAll();
  }

  async delete(id: string) {
    const existing = await this.findById(id);
    if (!existing) throw AppException.notFound('pipelineStage', id);

    const firstStage = await this.getFirstStage();
    if (firstStage.id === id) {
      throw AppException.badRequest('Cannot delete the first pipeline stage');
    }

    await this.db
      .update(leads)
      .set({ stageId: firstStage.id, updatedAt: new Date() } as any)
      .where(eq(leads.stageId, id));

    await this.db.delete(pipelineStages).where(eq(pipelineStages.id, id));
    return { deleted: true };
  }

  async findByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return this.db.select().from(pipelineStages).where(inArray(pipelineStages.id, ids));
  }
}
