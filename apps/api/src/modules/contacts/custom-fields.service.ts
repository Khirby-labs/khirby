import { Injectable, Inject } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import {
  customFieldDefinitions,
  type CustomFieldEntity,
  type CustomFieldType,
} from '../../core/database/schema';
import { AppException } from '../../core/errors/app-exception';

const TYPES: CustomFieldType[] = ['text', 'number', 'date', 'select'];

export type CustomValueError = 'invalid_select' | 'invalid_number' | 'invalid_date';

export function coerceCustomValue(
  type: CustomFieldType,
  options: string[] | null | undefined,
  raw: unknown,
): { ok: true; value: unknown } | { ok: false; reason: CustomValueError } {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, value: null };
  }
  if (type === 'number') {
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
    if (!Number.isFinite(n)) return { ok: false, reason: 'invalid_number' };
    return { ok: true, value: n };
  }
  if (type === 'date') {
    const s = String(raw).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, reason: 'invalid_date' };
    return { ok: true, value: s };
  }
  if (type === 'select') {
    const s = String(raw).trim();
    if (!(options ?? []).includes(s)) return { ok: false, reason: 'invalid_select' };
    return { ok: true, value: s };
  }
  return { ok: true, value: String(raw) };
}

export function slugifyFieldName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) throw AppException.badRequest('Name does not produce a usable slug');
  return slug;
}

@Injectable()
export class CustomFieldsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async list(entity: CustomFieldEntity) {
    return this.db
      .select()
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.entity, entity));
  }

  async findBySlug(entity: CustomFieldEntity, slug: string) {
    const [row] = await this.db
      .select()
      .from(customFieldDefinitions)
      .where(and(eq(customFieldDefinitions.entity, entity), eq(customFieldDefinitions.slug, slug)))
      .limit(1);
    return row ?? null;
  }

  async create(dto: {
    entity: CustomFieldEntity;
    name: string;
    type: CustomFieldType;
    options?: string[];
  }) {
    if (!TYPES.includes(dto.type)) {
      throw AppException.badRequest('Invalid custom field type');
    }
    if (dto.type === 'select') {
      const options = (dto.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (options.length === 0) {
        throw AppException.badRequest('Select fields require at least one option');
      }
      dto = { ...dto, options };
    }

    const slug = slugifyFieldName(dto.name);
    const [existing] = await this.db
      .select()
      .from(customFieldDefinitions)
      .where(
        and(eq(customFieldDefinitions.entity, dto.entity), eq(customFieldDefinitions.slug, slug)),
      )
      .limit(1);
    if (existing) throw AppException.alreadyExists('customField', 'slug', slug);

    const [created] = await this.db
      .insert(customFieldDefinitions)
      .values({
        entity: dto.entity,
        name: dto.name.trim(),
        slug,
        type: dto.type,
        options: dto.type === 'select' ? (dto.options ?? []) : [],
      } as any)
      .returning();
    return created;
  }

  async delete(id: string) {
    const [existing] = await this.db
      .select()
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.id, id))
      .limit(1);
    if (!existing) throw AppException.notFound('customField', id);

    await this.db.delete(customFieldDefinitions).where(eq(customFieldDefinitions.id, id));
    return { deleted: true };
  }
}
