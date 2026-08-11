import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { eq, sql, desc } from 'drizzle-orm';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import {
  forms,
  submissions,
  contacts,
  FormKind,
  SubmissionSource,
} from '../../core/database/schema';
import { validateSubmissionDataAgainstSchema } from './validate-submission-data';
import { AppException } from '../../core/errors/app-exception';
// Relative import: nest build is plain tsc; bare '@khirby/types' would survive into dist.
import {
  resolveFormFieldLabel,
  type LocaleCode,
} from '../../../../../packages/types/src';

type FormSchema = Array<{
  name: string;
  label: string;
  labels?: { en?: string; pl?: string };
  type: string;
  required: boolean;
  options?: string[];
}>;

/** Public wire field: resolved `label`, no `labels` map (ADR-0025 / back-compat). */
type PublicFormField = {
  name: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
};

@Injectable()
export class FormsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async findAll() {
    const rows = await this.db
      .select({
        id: forms.id,
        name: forms.name,
        slug: forms.slug,
        kind: forms.kind,
        schema: forms.schema,
        endpointToken: forms.endpointToken,
        active: forms.active,
        createdAt: forms.createdAt,
        submissionCount: sql<number>`count(${submissions.id})::int`,
      })
      .from(forms)
      .leftJoin(submissions, eq(submissions.formId, forms.id))
      .groupBy(forms.id)
      .orderBy(desc(forms.createdAt));

    return rows;
  }

  async findById(id: string) {
    const [form] = await this.db.select().from(forms).where(eq(forms.id, id)).limit(1);
    return form ?? null;
  }

  async findByToken(token: string) {
    const [form] = await this.db
      .select()
      .from(forms)
      .where(eq(forms.endpointToken, token))
      .limit(1);
    return form ?? null;
  }

  /**
   * Public shape for GET /api/public/forms/:token (ADR-0025).
   * Resolves each field's `label` for `locale`; strips the stored `labels` map.
   */
  toPublicForm(
    form: { name: string; slug: string; kind: FormKind; schema: FormSchema },
    locale: LocaleCode = 'en',
  ): {
    name: string;
    slug: string;
    kind: FormKind;
    fields: PublicFormField[];
  } {
    const fields = (form.schema ?? []).map((f): PublicFormField => {
      const field: PublicFormField = {
        name: f.name,
        label: resolveFormFieldLabel(f, locale),
        type: f.type,
        required: f.required,
      };
      if (f.options) field.options = f.options;
      return field;
    });
    return {
      name: form.name,
      slug: form.slug,
      kind: form.kind,
      fields,
    };
  }

  /**
   * Public submissions are matched to contacts by email (contacts.upsertByEmail) and the public
   * controller always requires a valid top-level `email`. A non-empty schema that lacks a required
   * `email` field therefore builds a form that can never accept a submission — reject it at write time.
   * An empty schema is an open form (accepts any body carrying an email), so it is allowed.
   */
  private assertSchemaCollectsEmail(schema?: FormSchema): void {
    if (!schema || schema.length === 0) return;
    const email = schema.find((f) => f.name === 'email');
    if (!email || !email.required) {
      throw AppException.badRequest(
        'Form must include a required "email" field — public submissions are matched to contacts by email address.',
        { field: 'email' },
      );
    }
  }

  async create(dto: {
    name: string;
    slug: string;
    schema: FormSchema;
    active?: boolean;
    kind?: FormKind;
  }) {
    this.assertSchemaCollectsEmail(dto.schema);

    const [existing] = await this.db.select().from(forms).where(eq(forms.slug, dto.slug)).limit(1);
    if (existing) throw AppException.alreadyExists('form', 'slug', dto.slug);

    const [created] = await this.db
      .insert(forms)
      .values({
        name: dto.name,
        slug: dto.slug,
        schema: dto.schema,
        active: dto.active ?? true,
        kind: dto.kind ?? 'contact',
      } as any)
      .returning();
    return created;
  }

  async update(
    id: string,
    dto: { name?: string; slug?: string; schema?: FormSchema; active?: boolean; kind?: FormKind },
  ) {
    const [existing] = await this.db.select().from(forms).where(eq(forms.id, id)).limit(1);
    if (!existing) throw AppException.notFound('form', id);

    if (dto.schema !== undefined) this.assertSchemaCollectsEmail(dto.schema);

    if (dto.slug && dto.slug !== existing.slug) {
      const [slugConflict] = await this.db
        .select()
        .from(forms)
        .where(eq(forms.slug, dto.slug))
        .limit(1);
      if (slugConflict) throw AppException.alreadyExists('form', 'slug', dto.slug);
    }

    const [updated] = await this.db
      .update(forms)
      .set(dto as any)
      .where(eq(forms.id, id))
      .returning();
    return updated;
  }

  async delete(id: string) {
    const [existing] = await this.db.select().from(forms).where(eq(forms.id, id)).limit(1);
    if (!existing) throw AppException.notFound('form', id);

    await this.db.delete(forms).where(eq(forms.id, id));
    return { deleted: true };
  }

  async findSubmissionsByFormId(formId: string, page = 1, pageSize = 20) {
    const form = await this.findById(formId);
    if (!form) throw AppException.notFound('form', formId);

    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));
    const limit = safePageSize;
    const offset = (safePage - 1) * safePageSize;
    const condition = eq(submissions.formId, formId);

    const data = await this.db
      .select({
        id: submissions.id,
        contactId: submissions.contactId,
        formId: submissions.formId,
        data: submissions.data,
        source: submissions.source,
        listmonkSynced: submissions.listmonkSynced,
        createdAt: submissions.createdAt,
        contactEmail: contacts.email,
        contactName: contacts.name,
      })
      .from(submissions)
      .innerJoin(contacts, eq(submissions.contactId, contacts.id))
      .where(condition)
      .orderBy(desc(submissions.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(submissions)
      .where(condition);

    return { data, total: count, page: safePage, pageSize: safePageSize };
  }

  async createSubmission(
    formId: string,
    contactId: string,
    data: Record<string, unknown>,
    source: SubmissionSource = {},
  ) {
    const [sub] = await this.db
      .insert(submissions)
      .values({ formId, contactId, data, source } as any)
      .returning();
    return sub;
  }

  validateSubmission(
    schema: Array<{ name: string; label?: string; type?: string; required: boolean }>,
    body: Record<string, unknown>,
  ): Record<string, unknown> {
    try {
      return validateSubmissionDataAgainstSchema(schema, body);
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw AppException.badRequest(e instanceof Error ? e.message : 'Validation failed');
    }
  }
}
