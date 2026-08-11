import { Injectable, Inject } from '@nestjs/common';
import { eq, asc } from 'drizzle-orm';
import { tbTags } from '../../../core/database/schema';
import { DB_TOKEN } from '../../../core/database/database.module';
import type { Db } from '../../../core/database/db';
import { AppException } from '../../../core/errors/app-exception';

export interface CreateTagDto {
  name: string;
  color?: string;
}

@Injectable()
export class TagsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async findAll() {
    return this.db.select().from(tbTags).orderBy(asc(tbTags.name));
  }

  async create(dto: CreateTagDto) {
    const [row] = await this.db
      .insert(tbTags)
      .values({
        name: dto.name.trim(),
        color: dto.color ?? '#6366f1',
      } as any)
      .returning();
    return row;
  }

  async delete(id: string) {
    const [row] = await this.db.select().from(tbTags).where(eq(tbTags.id, id)).limit(1);
    if (!row) throw AppException.notFound('tag', id);
    await this.db.delete(tbTags).where(eq(tbTags.id, id));
  }
}
