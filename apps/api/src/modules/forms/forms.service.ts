import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { eq, sql, desc } from 'drizzle-orm';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import {
  forms,
  submissions,
  contacts,
  FormKind,
  FormDestination,
  FormIntakeMode,
  SubmissionSource,
} from '../../core/database/schema';
import { validateSubmissionDataAgainstSchema } from './validate-submission-data';
import { AppException } from '../../core/errors/app-exception';
// Relative import: nest build is plain tsc; bare '@khirby/types' would survive into dist.
import { resolveFormFieldLabel, type LocaleCode } from '../../../../../packages/types/src';

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
    // Inquiry-destination forms never write `submissions` (ADR-0053) — count
    // `inquiries` for those rows so the Forms list matches the review queue.
    // Qualify table names in the subquery: drizzle's `${col}` inside sql`` drops
    // the table prefix, so `form_id = id` would compare inquiries.id to itself → 0.
    const rows = await this.db
      .select({
        id: forms.id,
        name: forms.name,
        slug: forms.slug,
        kind: forms.kind,
        schema: forms.schema,
        endpointToken: forms.endpointToken,
        active: forms.active,
        destination: forms.destination,
        intakeMode: forms.intakeMode,
        intakeBrief: forms.intakeBrief,
        systemPrompt: forms.systemPrompt,
        openingLabels: forms.openingLabels,
        createdAt: forms.createdAt,
        submissionCount: sql<number>`(
          case
            when ${forms.destination} = 'inquiry' then (
              select count(*)::int from inquiries where inquiries.form_id = forms.id
            )
            else (
              select count(*)::int from submissions where submissions.form_id = forms.id
            )
          end
        )`,
      })
      .from(forms)
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
   * Includes destination, intakeMode and capabilities.
   */
  toPublicForm(
    form: {
      name: string;
      slug: string;
      kind: FormKind;
      schema: FormSchema;
      destination?: FormDestination;
      intakeMode?: FormIntakeMode;
      openingLabels?: { en?: string; pl?: string } | null;
    },
    locale: LocaleCode = 'en',
    opts: { adaptiveAvailable?: boolean } = {},
  ): {
    name: string;
    slug: string;
    kind: FormKind;
    destination: FormDestination;
    intakeMode: FormIntakeMode;
    /** Resolved first question for adaptive forms (ADR-0054). */
    openingLabel: string | null;
    capabilities: { adaptiveAvailable: boolean };
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
    const labels = form.openingLabels;
    const openingLabel =
      labels?.[locale]?.trim() || labels?.en?.trim() || labels?.pl?.trim() || null;
    return {
      name: form.name,
      slug: form.slug,
      kind: form.kind,
      destination: form.destination ?? 'lead',
      intakeMode: form.intakeMode ?? 'static',
      openingLabel,
      capabilities: { adaptiveAvailable: opts.adaptiveAvailable ?? false },
      fields,
    };
  }

  /**
   * Public submissions are matched to contacts by email (contacts.upsertByEmail) and the public
   * controller always requires a valid top-level `email`. A non-empty schema that lacks a required
   * `email` field therefore builds a form that can never accept a submission — reject it at write time.
   * An empty schema is an open form (accepts any body carrying an email), so it is allowed.
   *
   * Only enforced for lead destination (or default). Inquiry forms do not require email.
   */
  private assertSchemaCollectsEmail(schema?: FormSchema, destination?: FormDestination): void {
    const effectiveDestination = destination ?? 'lead';
    if (effectiveDestination !== 'lead') return;
    if (!schema || schema.length === 0) return;
    const email = schema.find((f) => f.name === 'email');
    if (!email || !email.required) {
      throw AppException.badRequest(
        'Form must include a required "email" field — public submissions are matched to contacts by email address.',
        { field: 'email' },
      );
    }
  }

  /**
   * Adaptive intake needs a non-empty per-form system prompt (ADR-0054).
   * Create may land with an empty prompt so the operator can draft it on the detail page;
   * any subsequent update that leaves the form adaptive must keep a prompt.
   */
  private assertAdaptiveHasPrompt(
    intakeMode: FormIntakeMode,
    systemPrompt: string | null | undefined,
    opts: { requireOnCreate?: boolean } = {},
  ): void {
    if (intakeMode !== 'adaptive') return;
    if (!opts.requireOnCreate && (systemPrompt === undefined || systemPrompt === null)) return;
    if (!systemPrompt?.trim()) {
      throw AppException.badRequest(
        'Adaptive intake requires a non-empty system prompt. Describe the form intent and generate one first.',
        { field: 'systemPrompt' },
      );
    }
  }

  async create(dto: {
    name: string;
    slug: string;
    schema: FormSchema;
    active?: boolean;
    kind?: FormKind;
    destination?: FormDestination;
    intakeMode?: FormIntakeMode;
    intakeBrief?: string | null;
    systemPrompt?: string | null;
    openingLabels?: { en?: string; pl?: string } | null;
  }) {
    const destination = dto.destination ?? 'lead';
    const intakeMode = dto.intakeMode ?? 'static';

    if (destination === 'lead' && intakeMode === 'adaptive') {
      throw AppException.badRequest('Adaptive intake mode is not supported for lead destination.', {
        field: 'intakeMode',
      });
    }

    this.assertSchemaCollectsEmail(dto.schema, destination);
    // Allow empty prompt on create — detail page drafts it (ADR-0054).
    this.assertAdaptiveHasPrompt(intakeMode, dto.systemPrompt, { requireOnCreate: false });

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
        destination,
        intakeMode,
        intakeBrief: dto.intakeBrief ?? null,
        systemPrompt: dto.systemPrompt ?? null,
        openingLabels: dto.openingLabels ?? null,
      } as any)
      .returning();
    return created;
  }

  async update(
    id: string,
    dto: {
      name?: string;
      slug?: string;
      schema?: FormSchema;
      active?: boolean;
      kind?: FormKind;
      destination?: FormDestination;
      intakeMode?: FormIntakeMode;
      intakeBrief?: string | null;
      systemPrompt?: string | null;
      openingLabels?: { en?: string; pl?: string } | null;
    },
  ) {
    const [existing] = await this.db.select().from(forms).where(eq(forms.id, id)).limit(1);
    if (!existing) throw AppException.notFound('form', id);

    const destination = dto.destination ?? existing.destination ?? 'lead';
    const intakeMode = dto.intakeMode ?? existing.intakeMode ?? 'static';
    const systemPrompt = dto.systemPrompt !== undefined ? dto.systemPrompt : existing.systemPrompt;

    if (destination === 'lead' && intakeMode === 'adaptive') {
      throw AppException.badRequest('Adaptive intake mode is not supported for lead destination.', {
        field: 'intakeMode',
      });
    }

    if (dto.schema !== undefined) this.assertSchemaCollectsEmail(dto.schema, destination);
    this.assertAdaptiveHasPrompt(intakeMode, systemPrompt, { requireOnCreate: true });

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
