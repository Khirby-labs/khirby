import { Injectable, Inject, Optional } from '@nestjs/common';
import {
  eq,
  ilike,
  or,
  and,
  sql,
  desc,
  asc,
  gte,
  lte,
  isNotNull,
  isNull,
  ne,
  type SQL,
} from 'drizzle-orm';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import { contacts, submissions, forms, leads, pipelineStages } from '../../core/database/schema';
import { AppException } from '../../core/errors/app-exception';
import { PluginRegistryService } from '../plugins/plugin-registry.service';

export interface FormSubmissionContext {
  formId: string;
  formSlug: string;
  formKind: string;
  formName: string;
}

export type ContactSortBy = 'email' | 'name' | 'phone' | 'createdAt';
export type ContactSortDir = 'asc' | 'desc';
export type ContactNewsletterFilter = 'synced' | 'missing';

export interface FindContactsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: ContactSortBy;
  sortDir?: ContactSortDir;
  /** true = has non-empty phone; false = missing/empty phone */
  hasPhone?: boolean;
  formId?: string;
  newsletter?: ContactNewsletterFilter;
  /** Inclusive ISO day YYYY-MM-DD */
  createdFrom?: string;
  /** Inclusive ISO day YYYY-MM-DD */
  createdTo?: string;
}

const SORT_COLUMNS = {
  email: contacts.email,
  name: contacts.name,
  phone: contacts.phone,
  createdAt: contacts.createdAt,
} as const;

function mergeFormInterest(
  metadata: Record<string, unknown>,
  ctx: FormSubmissionContext,
): Record<string, unknown> {
  const now = new Date().toISOString();
  const raw = metadata.interests;
  const interests = Array.isArray(raw) ? [...raw] : [];

  const idx = interests.findIndex(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      (item as FormSubmissionContext).formId === ctx.formId,
  );

  const entry = { ...ctx, lastSubmittedAt: now };
  if (idx >= 0) {
    interests[idx] = { ...(interests[idx] as object), ...entry };
  } else {
    interests.push({ ...entry, firstSubmittedAt: now });
  }

  return { ...metadata, interests };
}

function parseIsoDayStart(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const d = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseIsoDayEnd(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const d = new Date(`${day}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

@Injectable()
export class ContactsService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    @Optional() private readonly plugins?: PluginRegistryService,
  ) {}

  private emitContactCreated(created: {
    id: string;
    email: string;
    name: string | null;
    metadata: unknown;
    createdAt: Date;
  }): void {
    void this.plugins?.emit({
      type: 'contact.created',
      payload: {
        id: created.id,
        email: created.email,
        name: created.name,
        metadata: (created.metadata ?? {}) as Record<string, unknown>,
        createdAt: created.createdAt,
      },
    });
  }

  async findAll(query: FindContactsQuery = {}) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const limit = pageSize;
    const offset = (page - 1) * pageSize;

    const sortBy: ContactSortBy =
      query.sortBy && query.sortBy in SORT_COLUMNS ? query.sortBy : 'createdAt';
    const sortDir: ContactSortDir = query.sortDir === 'asc' ? 'asc' : 'desc';
    const orderExpr = sortDir === 'asc' ? asc(SORT_COLUMNS[sortBy]) : desc(SORT_COLUMNS[sortBy]);

    const conditions: SQL[] = [];

    const search = query.search?.trim();
    if (search) {
      const pattern = `%${search}%`;
      const searchCond = or(
        ilike(contacts.email, pattern),
        ilike(contacts.name, pattern),
        ilike(contacts.phone, pattern),
      );
      if (searchCond) conditions.push(searchCond);
    }

    if (query.hasPhone === true) {
      conditions.push(and(isNotNull(contacts.phone), ne(contacts.phone, ''))!);
    } else if (query.hasPhone === false) {
      conditions.push(or(isNull(contacts.phone), eq(contacts.phone, ''))!);
    }

    if (query.formId) {
      // Partial containment: interests array has an object with this formId
      conditions.push(
        sql`${contacts.metadata}->'interests' @> ${JSON.stringify([{ formId: query.formId }])}::jsonb`,
      );
    }

    if (query.newsletter === 'synced') {
      conditions.push(sql`${contacts.metadata} ? 'listmonk'`);
    } else if (query.newsletter === 'missing') {
      conditions.push(sql`NOT (${contacts.metadata} ? 'listmonk')`);
    }

    if (query.createdFrom) {
      const from = parseIsoDayStart(query.createdFrom);
      if (from) conditions.push(gte(contacts.createdAt, from));
    }
    if (query.createdTo) {
      const to = parseIsoDayEnd(query.createdTo);
      if (to) conditions.push(lte(contacts.createdAt, to));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const baseQuery = this.db.select().from(contacts);
    const countQuery = this.db.select({ count: sql<number>`count(*)::int` }).from(contacts);

    const dataQuery = whereClause
      ? baseQuery.where(whereClause).orderBy(orderExpr).limit(limit).offset(offset)
      : baseQuery.orderBy(orderExpr).limit(limit).offset(offset);
    const totalQuery = whereClause ? countQuery.where(whereClause) : countQuery;

    const data = await dataQuery;
    const [{ count }] = await totalQuery;
    return { data, total: count, page, pageSize, sortBy, sortDir };
  }

  async findById(id: string) {
    const [contact] = await this.db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
    if (!contact) return null;
    const subs = await this.db
      .select({
        id: submissions.id,
        contactId: submissions.contactId,
        formId: submissions.formId,
        data: submissions.data,
        source: submissions.source,
        listmonkSynced: submissions.listmonkSynced,
        createdAt: submissions.createdAt,
        formName: forms.name,
      })
      .from(submissions)
      .leftJoin(forms, eq(submissions.formId, forms.id))
      .where(eq(submissions.contactId, id))
      .orderBy(desc(submissions.createdAt));
    const contactLeads = await this.db
      .select({
        id: leads.id,
        title: leads.title,
        stageId: leads.stageId,
        stageName: pipelineStages.name,
        priority: leads.priority,
        value: leads.value,
        formName: leads.formName,
        updatedAt: leads.updatedAt,
      })
      .from(leads)
      .leftJoin(pipelineStages, eq(leads.stageId, pipelineStages.id))
      .where(eq(leads.contactId, id))
      .orderBy(desc(leads.updatedAt));
    return { ...contact, submissions: subs, leads: contactLeads };
  }

  async upsertByEmail(
    email: string,
    data: {
      name?: string;
      metadata?: Record<string, unknown>;
      submissionContext?: FormSubmissionContext;
    },
  ) {
    const [existing] = await this.db
      .select()
      .from(contacts)
      .where(eq(contacts.email, email))
      .limit(1);

    if (existing) {
      const patch: Record<string, unknown> = {};

      if (data.submissionContext) {
        patch.metadata = mergeFormInterest(
          (existing.metadata ?? {}) as Record<string, unknown>,
          data.submissionContext,
        );
      }

      if (data.name && !existing.name) {
        patch.name = data.name;
      }

      if (Object.keys(patch).length === 0) {
        return existing;
      }

      const [updated] = await this.db
        .update(contacts)
        .set({ ...patch, updatedAt: new Date() } as any)
        .where(eq(contacts.id, existing.id))
        .returning();
      return updated;
    }

    let metadata = data.metadata ?? {};
    if (data.submissionContext) {
      metadata = mergeFormInterest(metadata, data.submissionContext);
    }

    const [created] = await this.db
      .insert(contacts)
      .values({ email, name: data.name ?? null, metadata } as any)
      .returning();
    this.emitContactCreated(created);
    return created;
  }

  async create(dto: {
    email: string;
    name?: string;
    phone?: string;
    metadata?: Record<string, unknown>;
  }) {
    const [existing] = await this.db
      .select()
      .from(contacts)
      .where(eq(contacts.email, dto.email))
      .limit(1);
    if (existing) throw AppException.alreadyExists('contact', 'email', dto.email);

    const [created] = await this.db
      .insert(contacts)
      .values({
        email: dto.email,
        name: dto.name ?? null,
        phone: dto.phone?.trim() ? dto.phone.trim() : null,
        metadata: dto.metadata ?? {},
      } as any)
      .returning();
    this.emitContactCreated(created);
    return created;
  }

  async update(
    id: string,
    dto: {
      email?: string;
      name?: string;
      phone?: string | null;
      metadata?: Record<string, unknown>;
    },
  ) {
    const [existing] = await this.db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
    if (!existing) throw AppException.notFound('contact', id);

    if (dto.email !== undefined && dto.email !== existing.email) {
      const [conflict] = await this.db
        .select()
        .from(contacts)
        .where(eq(contacts.email, dto.email))
        .limit(1);
      if (conflict) throw AppException.alreadyExists('contact', 'email', dto.email);
    }

    const patch: Record<string, unknown> = { ...dto };
    if (dto.phone !== undefined) {
      patch.phone = typeof dto.phone === 'string' && dto.phone.trim() ? dto.phone.trim() : null;
    }

    const [updated] = await this.db
      .update(contacts)
      .set({ ...patch, updatedAt: new Date() } as any)
      .where(eq(contacts.id, id))
      .returning();
    return updated;
  }

  async delete(id: string) {
    const [existing] = await this.db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
    if (!existing) throw AppException.notFound('contact', id);

    await this.db.delete(contacts).where(eq(contacts.id, id));
    return { deleted: true };
  }
}
