import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { eq, desc, asc, ilike, or, and, sql, type SQL } from 'drizzle-orm';
import { ModuleRef } from '@nestjs/core';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import {
  inquiries,
  inquiryMessages,
  forms,
  type InquiryStatus,
  type InquiryMessageRole,
  type InquiryBrief,
  EMPTY_INQUIRY_BRIEF,
} from '../../core/database/schema';
import { AppException } from '../../core/errors/app-exception';
import { EventsService } from '../../core/events/events.service';
import { PluginRegistryService } from '../plugins/plugin-registry.service';
import { ContactsService } from '../contacts/contacts.service';
import { LeadsService } from '../leads/leads.service';
import { lockMutation } from '../../core/database/transaction';
// Relative import: nest build emits bare specifiers verbatim; plugin-host stays relative.
import {
  INQUIRY_INTAKE_ASSISTANT,
  type InquiryIntakeAssistant,
  resolveLoadedProvider,
} from '../../../../../packages/plugin-host/src';
import { assertPublicAdaptiveBatch } from './adaptive-intake-guards';

const TERMINAL_STATUSES: InquiryStatus[] = ['accepted', 'rejected', 'spam'];

function detectVisitorLocale(content: string): 'pl' | 'en' | undefined {
  if (/[ąćęłńóśźż]/i.test(content)) return 'pl';
  return undefined;
}

const ALLOWED_TRANSITIONS: Record<InquiryStatus, InquiryStatus[]> = {
  active: ['ready_for_review', 'rejected', 'spam'],
  ready_for_review: ['accepted', 'rejected', 'spam'],
  accepted: [],
  rejected: [],
  spam: [],
};

function serializeInquiry(row: typeof inquiries.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class InquiryService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private events: EventsService,
    private plugins: PluginRegistryService,
    private contacts: ContactsService,
    private leadsService: LeadsService,
    private moduleRef: ModuleRef,
  ) {}

  /**
   * Central status mutator — the only place that writes `status` (except the CAS inside accept()).
   * Enforces allowed transitions and sets reviewedAt/reviewedBy for terminal statuses.
   */
  async transition(id: string, to: InquiryStatus, opts: { actorId?: string } = {}) {
    const [inquiry] = await this.db.select().from(inquiries).where(eq(inquiries.id, id)).limit(1);

    if (!inquiry) throw AppException.notFound('inquiry', id);

    if (TERMINAL_STATUSES.includes(inquiry.status)) {
      throw new ConflictException(
        `Inquiry ${id} is already in terminal status '${inquiry.status}'`,
      );
    }

    const allowed = ALLOWED_TRANSITIONS[inquiry.status] ?? [];
    if (!allowed.includes(to)) {
      throw AppException.badRequest(
        `Cannot transition inquiry from '${inquiry.status}' to '${to}'`,
      );
    }

    const patch: Record<string, unknown> = {
      status: to,
      updatedAt: new Date(),
    };

    if ((to === 'rejected' || to === 'spam') && opts.actorId) {
      patch.reviewedAt = new Date();
      patch.reviewedBy = opts.actorId;
    }

    await this.db
      .update(inquiries)
      .set(patch as any)
      .where(eq(inquiries.id, id));

    const [updated] = await this.db.select().from(inquiries).where(eq(inquiries.id, id)).limit(1);

    return updated;
  }

  async findAll(query: {
    page?: number;
    pageSize?: number;
    status?: string;
    q?: string;
    formId?: string;
  }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions: SQL[] = [];
    if (query.status) {
      conditions.push(eq(inquiries.status, query.status as InquiryStatus));
    }
    if (query.formId) {
      conditions.push(eq(inquiries.formId, query.formId));
    }
    if (query.q) {
      conditions.push(
        or(
          ilike(inquiries.contactName, `%${query.q}%`),
          ilike(inquiries.email, `%${query.q}%`),
          ilike(inquiries.companyName, `%${query.q}%`),
        ) as SQL,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select()
      .from(inquiries)
      .where(where)
      .orderBy(desc(inquiries.createdAt))
      .limit(pageSize)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(inquiries)
      .where(where);

    return {
      data: rows.map(serializeInquiry),
      total: count,
      page,
      pageSize,
    };
  }

  async findById(id: string) {
    const [inquiry] = await this.db.select().from(inquiries).where(eq(inquiries.id, id)).limit(1);

    if (!inquiry) return null;

    // Self-heal empty summary/type on open (legacy rows + early submit).
    if (!inquiry.aiSummary?.trim() || !inquiry.proposedType?.trim()) {
      await this.ensureAiFields(id);
      const [refreshed] = await this.db
        .select()
        .from(inquiries)
        .where(eq(inquiries.id, id))
        .limit(1);
      if (refreshed) {
        const messages = await this.db
          .select()
          .from(inquiryMessages)
          .where(eq(inquiryMessages.inquiryId, id))
          .orderBy(asc(inquiryMessages.createdAt));
        const openingLabel = refreshed.formId
          ? await this.getFormOpeningLabel(refreshed.formId)
          : null;
        return {
          ...serializeInquiry(refreshed),
          openingLabel,
          messages: messages.map((m) => ({
            ...m,
            createdAt: m.createdAt.toISOString(),
          })),
        };
      }
    }

    const messages = await this.db
      .select()
      .from(inquiryMessages)
      .where(eq(inquiryMessages.inquiryId, id))
      .orderBy(asc(inquiryMessages.createdAt));

    const openingLabel = inquiry.formId ? await this.getFormOpeningLabel(inquiry.formId) : null;

    return {
      ...serializeInquiry(inquiry),
      openingLabel,
      messages: messages.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async findByPublicToken(token: string) {
    const [inquiry] = await this.db
      .select()
      .from(inquiries)
      .where(eq(inquiries.publicToken, token))
      .limit(1);

    if (!inquiry) return null;

    const messages = await this.db
      .select()
      .from(inquiryMessages)
      .where(eq(inquiryMessages.inquiryId, inquiry.id))
      .orderBy(asc(inquiryMessages.createdAt));

    return {
      ...serializeInquiry(inquiry),
      messages: messages.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async createFromForm(input: {
    formId?: string;
    source?: string;
    sourceMeta?: Record<string, unknown>;
    contactName?: string;
    email?: string;
    companyName?: string;
    structuredData?: Record<string, unknown>;
  }) {
    const [created] = await this.db
      .insert(inquiries)
      .values({
        formId: input.formId ?? null,
        source: input.source ?? null,
        sourceMeta: {
          ...(input.sourceMeta ?? {}),
          // Keep the raw public POST payload for audit — not the adaptive brief.
          ...(input.structuredData ? { submission: input.structuredData } : {}),
        },
        status: 'active',
        contactName: input.contactName ?? null,
        email: input.email ?? null,
        companyName: input.companyName ?? null,
        structuredData: EMPTY_INQUIRY_BRIEF,
      } as any)
      .returning();

    this.events.emit('inquiry.created', { id: created.id });
    void this.plugins.emit({
      type: 'inquiry.created',
      payload: {
        id: created.id,
        formId: created.formId ?? null,
        status: 'active' as const,
        email: created.email ?? null,
        contactName: created.contactName ?? null,
        createdAt: created.createdAt,
      },
    });

    return serializeInquiry(created);
  }

  /** Public submit may attach contact after adaptive Q&A (landing contact-last). */
  async applyPublicContact(
    id: string,
    input: { contactName?: string; email?: string; companyName?: string },
  ) {
    const [inquiry] = await this.db.select().from(inquiries).where(eq(inquiries.id, id)).limit(1);
    if (!inquiry) throw AppException.notFound('inquiry', id);
    if (inquiry.status !== 'active' && inquiry.status !== 'ready_for_review') {
      throw AppException.badRequest('Inquiry contact can no longer be updated');
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.contactName?.trim()) patch.contactName = input.contactName.trim();
    if (input.email?.trim()) patch.email = input.email.trim();
    if (input.companyName?.trim()) patch.companyName = input.companyName.trim();
    if (Object.keys(patch).length === 1) return serializeInquiry(inquiry);

    const [updated] = await this.db
      .update(inquiries)
      .set(patch as any)
      .where(eq(inquiries.id, id))
      .returning();

    return serializeInquiry(updated ?? inquiry);
  }

  async appendMessage(
    inquiryId: string,
    opts: { role: InquiryMessageRole; content: string; metadata?: Record<string, unknown> },
  ) {
    const [inquiry] = await this.db
      .select()
      .from(inquiries)
      .where(eq(inquiries.id, inquiryId))
      .limit(1);

    if (!inquiry) throw AppException.notFound('inquiry', inquiryId);
    if (inquiry.status !== 'active') {
      throw AppException.badRequest('Messages can only be appended to active inquiries');
    }

    const [msg] = await this.db
      .insert(inquiryMessages)
      .values({
        inquiryId,
        role: opts.role,
        content: opts.content,
        metadata: opts.metadata ?? null,
      } as any)
      .returning();

    this.events.emit('inquiry.message.created', { id: msg.id, inquiryId });
    void this.plugins.emit({
      type: 'inquiry.message.created',
      payload: {
        id: msg.id,
        inquiryId,
        role: opts.role,
        createdAt: msg.createdAt,
      },
    });

    return { ...msg, createdAt: msg.createdAt.toISOString() };
  }

  async submitForReview(id: string) {
    const [current] = await this.db.select().from(inquiries).where(eq(inquiries.id, id)).limit(1);
    if (!current) throw AppException.notFound('inquiry', id);
    if (current.status === 'ready_for_review') {
      return serializeInquiry(current);
    }

    await this.ensureAiFields(id);
    const updated = await this.transition(id, 'ready_for_review');

    this.events.emit('inquiry.ready_for_review', { id });
    void this.plugins.emit({
      type: 'inquiry.ready_for_review',
      payload: {
        id,
        email: updated?.email ?? null,
        contactName: updated?.contactName ?? null,
        formId: updated?.formId ?? null,
        createdAt: updated?.createdAt ?? new Date(),
      },
    });

    return updated ? serializeInquiry(updated) : null;
  }

  /**
   * Fill aiSummary / proposedType when the intake ended without them
   * (model returned null, or submit-for-review was forced early).
   */
  async ensureAiFields(id: string): Promise<void> {
    const [inquiry] = await this.db.select().from(inquiries).where(eq(inquiries.id, id)).limit(1);
    if (!inquiry) return;

    const needsSummary = !inquiry.aiSummary?.trim();
    const needsType = !inquiry.proposedType?.trim();
    if (!needsSummary && !needsType) return;

    const messages = await this.db
      .select()
      .from(inquiryMessages)
      .where(eq(inquiryMessages.inquiryId, id))
      .orderBy(asc(inquiryMessages.createdAt));

    if (messages.length === 0 && !needsSummary && !needsType) return;

    const brief: InquiryBrief = {
      ...EMPTY_INQUIRY_BRIEF,
      ...((inquiry.structuredData as Partial<InquiryBrief> | null) ?? {}),
      currentTools: Array.isArray((inquiry.structuredData as InquiryBrief | null)?.currentTools)
        ? (inquiry.structuredData as InquiryBrief).currentTools
        : [],
      constraints: Array.isArray((inquiry.structuredData as InquiryBrief | null)?.constraints)
        ? (inquiry.structuredData as InquiryBrief).constraints
        : [],
    };

    const assistant = this.assistant();
    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (assistant && messages.length > 0) {
      try {
        const result = await assistant.finalize({
          messages: messages.map((m) => ({
            role: m.role as 'visitor' | 'assistant',
            content: m.content,
          })),
          brief,
          systemPrompt: inquiry.formId ? await this.getFormSystemPrompt(inquiry.formId) : null,
        });
        if (needsSummary && result.summary?.trim()) patch.aiSummary = result.summary.trim();
        if (needsType && result.proposedType?.trim())
          patch.proposedType = result.proposedType.trim();
        if ((!inquiry.tags || inquiry.tags.length === 0) && result.tags.length > 0) {
          patch.tags = result.tags;
        }
      } catch {
        // Fall through to heuristic below.
      }
    }

    if (needsSummary && !patch.aiSummary) {
      const visitorText = messages
        .filter((m) => m.role === 'visitor')
        .map((m) => m.content.trim())
        .filter(Boolean)[0];
      patch.aiSummary =
        brief.problem?.trim() || brief.desiredOutcome?.trim() || visitorText?.slice(0, 180) || null;
    }
    if (needsType && !patch.proposedType) {
      patch.proposedType = brief.inquiryType?.trim() || null;
    }

    if (patch.aiSummary || patch.proposedType || patch.tags) {
      await this.db
        .update(inquiries)
        .set(patch as any)
        .where(eq(inquiries.id, id));
    }
  }

  async reject(id: string, actorId: string) {
    const updated = await this.transition(id, 'rejected', { actorId });

    this.events.emit('inquiry.rejected', { id });
    void this.plugins.emit({
      type: 'inquiry.rejected',
      payload: {
        id,
        status: 'rejected' as const,
        email: updated?.email ?? null,
        contactName: updated?.contactName ?? null,
        formId: updated?.formId ?? null,
        createdAt: updated?.createdAt ?? new Date(),
      },
    });

    return updated ? serializeInquiry(updated) : null;
  }

  async spam(id: string, actorId: string) {
    const updated = await this.transition(id, 'spam', { actorId });

    this.events.emit('inquiry.spam', { id });
    void this.plugins.emit({
      type: 'inquiry.spam',
      payload: {
        id,
        status: 'spam' as const,
        email: updated?.email ?? null,
        contactName: updated?.contactName ?? null,
        formId: updated?.formId ?? null,
        createdAt: updated?.createdAt ?? new Date(),
      },
    });

    return updated ? serializeInquiry(updated) : null;
  }

  /** Resolve the optional AI intake assistant (volume plugin, bound after boot). */
  private assistant(): InquiryIntakeAssistant | null {
    return resolveLoadedProvider<InquiryIntakeAssistant>(this.moduleRef, INQUIRY_INTAKE_ASSISTANT);
  }

  /** True when the assistant token is currently bound (used by public-forms capabilities). */
  hasAssistant(): boolean {
    return this.assistant() !== null;
  }

  /** Look up the intakeMode of the form that owns this inquiry. */
  async getIntakeMode(formId: string): Promise<'static' | 'adaptive'> {
    const [form] = await this.db
      .select({ intakeMode: forms.intakeMode })
      .from(forms)
      .where(eq(forms.id, formId))
      .limit(1);
    return form?.intakeMode ?? 'static';
  }

  /** Look up the per-form system prompt (ADR-0054). */
  async getFormSystemPrompt(formId: string): Promise<string | null> {
    const [form] = await this.db
      .select({ systemPrompt: forms.systemPrompt })
      .from(forms)
      .where(eq(forms.id, formId))
      .limit(1);
    return form?.systemPrompt ?? null;
  }

  /** Resolve the visitor-facing opening question for a form (ADR-0054). */
  async getFormOpeningLabel(formId: string, locale?: string): Promise<string | null> {
    const [form] = await this.db
      .select({ openingLabels: forms.openingLabels })
      .from(forms)
      .where(eq(forms.id, formId))
      .limit(1);
    const labels = form?.openingLabels as { en?: string; pl?: string } | null;
    if (!labels) return null;
    const preferred = locale === 'pl' ? labels.pl : locale === 'en' ? labels.en : undefined;
    const pick = preferred?.trim() || labels.en?.trim() || labels.pl?.trim();
    return pick || null;
  }

  /**
   * Admin-only: run the intake assistant against ephemeral messages without
   * writing Inquiry rows (ADR-0054 preview-chat).
   */
  async previewChat(
    formId: string,
    opts: {
      messages: Array<{ role: 'visitor' | 'assistant'; content: string }>;
      content: string;
    },
  ): Promise<{
    readyForReview: boolean;
    nextQuestion: string | null;
    summary: string | null;
  }> {
    const [form] = await this.db.select().from(forms).where(eq(forms.id, formId)).limit(1);
    if (!form) throw AppException.notFound('form', formId);
    if (form.destination !== 'inquiry' || form.intakeMode !== 'adaptive') {
      throw AppException.badRequest('Preview chat is only available for adaptive inquiry forms.');
    }
    if (!form.systemPrompt?.trim()) {
      throw AppException.badRequest(
        'Save a system prompt on this form before testing the conversation.',
        { field: 'systemPrompt' },
      );
    }

    const assistant = this.assistant();
    if (!assistant) {
      throw AppException.pluginRequired(
        'ai-compose',
        'AI Compose is required for adaptive intake preview. Install and configure it in Settings → Plugins.',
      );
    }

    const emptyBrief = {
      problem: null,
      desiredOutcome: null,
      currentProcess: null,
      currentTools: [] as string[],
      teamSize: null,
      constraints: [] as string[],
      timeline: null,
      inquiryType: null,
    };

    const messages = [...opts.messages, { role: 'visitor' as const, content: opts.content }];

    const result = await assistant.process({
      inquiryId: `preview-${formId}`,
      messages,
      brief: emptyBrief,
      latestVisitorMessage: opts.content,
      systemPrompt: form.systemPrompt,
    });

    return {
      readyForReview: result.readyForReview,
      nextQuestion: result.nextQuestion ?? null,
      summary: result.summary ?? null,
    };
  }

  /** Admin-only: draft a system prompt from an operator brief (ADR-0054). */
  async draftSystemPrompt(
    formId: string,
    brief: string,
    locale?: string,
  ): Promise<{ systemPrompt: string; openingLabels: { en: string; pl: string } }> {
    const [form] = await this.db.select().from(forms).where(eq(forms.id, formId)).limit(1);
    if (!form) throw AppException.notFound('form', formId);

    const assistant = this.assistant();
    if (!assistant) {
      throw AppException.pluginRequired(
        'ai-compose',
        'AI Compose is required to draft a system prompt. Install and configure it in Settings → Plugins.',
      );
    }

    return assistant.draftSystemPrompt({ brief, locale });
  }

  /**
   * Admin-only: plan a batch of follow-up questions in one LLM call so the
   * preview UI can step through them without waiting between answers.
   */
  async planQuestions(
    formId: string,
    opts: { openingMessage: string; count?: number; locale?: string },
  ): Promise<{ questions: string[] }> {
    const [form] = await this.db.select().from(forms).where(eq(forms.id, formId)).limit(1);
    if (!form) throw AppException.notFound('form', formId);
    if (form.destination !== 'inquiry' || form.intakeMode !== 'adaptive') {
      throw AppException.badRequest(
        'Planning questions is only available for adaptive inquiry forms.',
      );
    }
    if (!form.systemPrompt?.trim()) {
      throw AppException.badRequest(
        'Save a system prompt on this form before planning questions.',
        { field: 'systemPrompt' },
      );
    }

    const assistant = this.assistant();
    if (!assistant) {
      throw AppException.pluginRequired(
        'ai-compose',
        'AI Compose is required to plan questions. Install and configure it in Settings → Plugins.',
      );
    }

    return assistant.planQuestions({
      openingMessage: opts.openingMessage,
      systemPrompt: form.systemPrompt,
      count: opts.count ?? 3,
      locale: opts.locale,
    });
  }

  /**
   * Public adaptive intake — one DB write for the whole visit.
   *
   * Landing calls `planQuestions` first (no persistence), then POSTs opening +
   * the planned questions + answers + contact in a single request. We create the
   * inquiry, append the full Q→A transcript, finalize AI fields, and mark
   * ready_for_review in one flow — no intermediate inquiry rows.
   */
  async submitAdaptiveIntake(input: {
    formId: string;
    source?: string;
    sourceMeta?: Record<string, unknown>;
    opening: string;
    questions: string[];
    answers: string[];
    locale?: string;
    contactName?: string;
    email?: string;
    companyName?: string;
  }) {
    const { opening, questions, answers } = assertPublicAdaptiveBatch({
      opening: input.opening,
      questions: input.questions,
      answers: input.answers,
    });

    const locale =
      input.locale === 'pl' || input.locale === 'en'
        ? input.locale
        : detectVisitorLocale([opening, ...answers].join(' '));

    const openingLabel = await this.getFormOpeningLabel(input.formId, locale);

    const messageRows: Array<{ role: InquiryMessageRole; content: string }> = [];
    if (openingLabel) {
      messageRows.push({ role: 'assistant', content: openingLabel });
    }
    messageRows.push({ role: 'visitor', content: opening });
    for (let i = 0; i < questions.length; i++) {
      messageRows.push({ role: 'assistant', content: questions[i] });
      messageRows.push({ role: 'visitor', content: answers[i] });
    }

    const created = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(inquiries)
        .values({
          formId: input.formId,
          source: input.source ?? null,
          sourceMeta: input.sourceMeta ?? {},
          status: 'active',
          contactName: input.contactName ?? null,
          email: input.email ?? null,
          companyName: input.companyName ?? null,
          structuredData: {
            ...EMPTY_INQUIRY_BRIEF,
            problem: opening.slice(0, 500),
          },
          aiMetadata: { intakeLocale: locale ?? null },
        } as any)
        .returning();

      for (const msg of messageRows) {
        await tx.insert(inquiryMessages).values({
          inquiryId: row.id,
          role: msg.role,
          content: msg.content,
          metadata: null,
        } as any);
      }

      return row;
    });

    this.events.emit('inquiry.created', { id: created.id });
    void this.plugins.emit({
      type: 'inquiry.created',
      payload: {
        id: created.id,
        formId: created.formId ?? null,
        status: 'active' as const,
        email: created.email ?? null,
        contactName: created.contactName ?? null,
        createdAt: created.createdAt,
      },
    });

    await this.ensureAiFields(created.id);
    const updated = await this.transition(created.id, 'ready_for_review');

    this.events.emit('inquiry.ready_for_review', { id: created.id });
    void this.plugins.emit({
      type: 'inquiry.ready_for_review',
      payload: {
        id: created.id,
        email: updated?.email ?? created.email ?? null,
        contactName: updated?.contactName ?? created.contactName ?? null,
        formId: updated?.formId ?? created.formId ?? null,
        createdAt: updated?.createdAt ?? created.createdAt,
      },
    });

    return updated ? serializeInquiry(updated) : serializeInquiry(created);
  }

  async accept(id: string, actorId: string, opts: { stageId?: string } = {}) {
    return this.db.transaction(async (tx) => {
      await lockMutation(tx, 'inquiry');

      // Load the row under the advisory lock
      const [current] = await tx.select().from(inquiries).where(eq(inquiries.id, id)).limit(1);

      if (!current) throw AppException.notFound('inquiry', id);

      // Email required before we write anything
      if (!current.email?.trim()) {
        throw AppException.badRequest('Inquiry must have an email to be accepted');
      }

      // Idempotency: already accepted with a lead → return current state
      if (current.status === 'accepted' && current.leadId) {
        return serializeInquiry(current);
      }

      // Status guard
      if (current.status !== 'ready_for_review') {
        throw new ConflictException(`Inquiry cannot be accepted from status '${current.status}'`);
      }

      // CAS: UPDATE WHERE status='ready_for_review'
      const [accepted] = await tx
        .update(inquiries)
        .set({
          status: 'accepted',
          reviewedAt: new Date(),
          reviewedBy: actorId,
          updatedAt: new Date(),
        } as any)
        .where(and(eq(inquiries.id, id), eq(inquiries.status, 'ready_for_review')))
        .returning();

      if (!accepted) {
        // Should not happen under advisory lock, but guard defensively
        throw new ConflictException('Inquiry status changed concurrently');
      }

      // Upsert contact (uses ContactsService.db — OK under advisory lock)
      const contact = await this.contacts.upsertByEmail(current.email.trim(), {
        name: current.contactName ?? undefined,
        metadata: current.companyName?.trim() ? { company: current.companyName.trim() } : undefined,
      });

      const brief: InquiryBrief = {
        ...EMPTY_INQUIRY_BRIEF,
        ...((current.structuredData as Partial<InquiryBrief> | null) ?? {}),
        currentTools: Array.isArray((current.structuredData as InquiryBrief | null)?.currentTools)
          ? (current.structuredData as InquiryBrief).currentTools
          : [],
        constraints: Array.isArray((current.structuredData as InquiryBrief | null)?.constraints)
          ? (current.structuredData as InquiryBrief).constraints
          : [],
      };

      // Create lead with intake context so the pipeline shows who this is
      const lead = await this.leadsService.createFromInquiry({
        inquiryId: id,
        contactId: contact.id,
        contactName: current.contactName,
        email: current.email.trim(),
        stageId: opts.stageId,
        companyName: current.companyName,
        formName: current.source,
        aiSummary: current.aiSummary,
        proposedType: current.proposedType,
        tags: current.tags ?? [],
        brief,
      });

      // Stamp leadId on the inquiry
      await tx
        .update(inquiries)
        .set({ leadId: lead.id } as any)
        .where(eq(inquiries.id, id));

      this.events.emit('inquiry.accepted', { id, leadId: lead.id });
      void this.plugins.emit({
        type: 'inquiry.accepted',
        payload: {
          id,
          status: 'accepted' as const,
          email: current.email.trim(),
          contactName: current.contactName ?? null,
          leadId: lead.id,
          formId: current.formId ?? null,
          createdAt: current.createdAt,
        },
      });

      return { ...serializeInquiry(accepted), leadId: lead.id };
    });
  }
}
