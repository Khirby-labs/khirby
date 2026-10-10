import { Injectable, Inject } from '@nestjs/common';
import { eq, desc, asc, inArray, and, isNotNull } from 'drizzle-orm';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import {
  leads,
  contacts,
  submissions,
  users,
  leadComments,
  emailThreads,
  emailMessages,
  inquiries,
  type InquiryBrief,
  EMPTY_INQUIRY_BRIEF,
} from '../../core/database/schema';
import { PipelineStagesService } from './pipeline-stages.service';
import { ContactsService } from '../contacts/contacts.service';
import { EventsService } from '../../core/events/events.service';
import { PluginRegistryService } from '../plugins/plugin-registry.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { AppException } from '../../core/errors/app-exception';

function extractValueFromSubmission(data: Record<string, unknown>): string | null {
  for (const key of ['value', 'amount', 'budget']) {
    const raw = data[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const num = Number(raw);
    if (!Number.isNaN(num)) return String(num);
  }
  return null;
}

const HANDOFF_COPY = {
  pl: {
    address: 'Adres',
    phone: 'Telefon',
    timeline: 'Termin',
    desiredOutcome: 'Oczekiwany efekt',
    currentProcess: 'Obecny proces',
    tools: 'Narzędzia',
    teamSize: 'Wielkość zespołu',
    constraints: 'Ograniczenia',
  },
  en: {
    address: 'Address',
    phone: 'Phone',
    timeline: 'Timeline',
    desiredOutcome: 'Desired outcome',
    currentProcess: 'Current process',
    tools: 'Tools',
    teamSize: 'Team size',
    constraints: 'Constraints',
  },
} as const;

const STREET_KEYS = new Set(['street', 'ulica', 'address', 'adres', 'addressline1', 'line1']);
const POSTAL_KEYS = new Set(['postalcode', 'zip', 'zipcode', 'kodpocztowy', 'postcode']);
const CITY_KEYS = new Set(['city', 'miasto', 'town', 'miejscowosc']);
const COUNTRY_KEYS = new Set(['country', 'kraj']);
const PHONE_KEYS = new Set(['phone', 'telefon', 'mobile', 'tel', 'komorka', 'komorkowy']);

function normalizeFieldKey(key: string): string {
  return key.replace(/[_\-\s]/g, '').toLowerCase();
}

function contactFieldText(raw: unknown): string | null {
  if (typeof raw === 'string') {
    const value = raw.trim();
    return value || null;
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return null;
}

function humanizeFieldKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-ząćęłńóśźż])([A-Z])/g, '$1 $2')
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export type ContactFieldLabel = {
  label?: string | null;
  pl?: string | null;
  en?: string | null;
};

function resolveFieldLabel(
  key: string,
  labels: Record<string, ContactFieldLabel | string> | null | undefined,
  locale: 'pl' | 'en',
): string {
  const entry = labels?.[key];
  if (!entry) return humanizeFieldKey(key);
  if (typeof entry === 'string') return entry.trim() || humanizeFieldKey(key);
  const localized = entry[locale]?.trim();
  const fallback = entry.label?.trim();
  const other = (locale === 'pl' ? entry.en : entry.pl)?.trim();
  return localized || fallback || other || humanizeFieldKey(key);
}

function handoffLocale(parts: Array<string | null | undefined>): 'pl' | 'en' {
  const blob = parts.filter((part): part is string => !!part).join('\n');
  return /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(blob) ? 'pl' : 'en';
}

function takeContactField(bag: Map<string, string>, aliases: Set<string>): string | null {
  for (const [key, value] of bag) {
    if (!aliases.has(normalizeFieldKey(key))) continue;
    bag.delete(key);
    return value;
  }
  return null;
}

/**
 * Handoff note written on the lead when an inquiry is accepted from review.
 * A person should be able to act on it: the summary, then the site address,
 * phone, and brief facts. Raw keys, tags, company, and type stay off the note
 * (ADR-0059) — those already live on the lead.
 */
export function buildInquiryIntakeComment(input: {
  aiSummary?: string | null;
  brief?: InquiryBrief | null;
  contactFields?: Record<string, unknown> | null;
  /** Operator labels from the form schema, keyed by field name. */
  fieldLabels?: Record<string, ContactFieldLabel | string> | null;
}): string {
  const bag = new Map<string, string>();
  if (input.contactFields) {
    for (const [key, raw] of Object.entries(input.contactFields)) {
      const value = contactFieldText(raw);
      if (value) bag.set(key, value);
    }
  }

  const street = takeContactField(bag, STREET_KEYS);
  const postal = takeContactField(bag, POSTAL_KEYS);
  const city = takeContactField(bag, CITY_KEYS);
  const country = takeContactField(bag, COUNTRY_KEYS);
  const phone = takeContactField(bag, PHONE_KEYS);
  const locality = [postal, city].filter(Boolean).join(' ');
  const address = [street, locality, country].filter(Boolean).join(', ');

  const summary = input.aiSummary?.trim() || '';
  const problem = input.brief?.problem?.trim() || '';
  const opening = summary || problem;

  const locale = handoffLocale([
    opening,
    address,
    phone,
    ...bag.values(),
    input.brief?.desiredOutcome,
    input.brief?.currentProcess,
    input.brief?.timeline,
    ...(input.brief?.constraints ?? []),
    ...(input.brief?.currentTools ?? []),
  ]);
  const copy = HANDOFF_COPY[locale];
  const facts: string[] = [];

  if (address) facts.push(`${copy.address}: ${address}`);
  if (phone) facts.push(`${copy.phone}: ${phone}`);

  for (const [key, value] of bag) {
    facts.push(`${resolveFieldLabel(key, input.fieldLabels, locale)}: ${value}`);
  }

  const brief = input.brief;
  if (brief) {
    if (brief.timeline?.trim()) facts.push(`${copy.timeline}: ${brief.timeline.trim()}`);
    if (brief.desiredOutcome?.trim()) {
      facts.push(`${copy.desiredOutcome}: ${brief.desiredOutcome.trim()}`);
    }
    if (brief.currentProcess?.trim()) {
      facts.push(`${copy.currentProcess}: ${brief.currentProcess.trim()}`);
    }
    if (Array.isArray(brief.currentTools) && brief.currentTools.length) {
      facts.push(`${copy.tools}: ${brief.currentTools.join(', ')}`);
    }
    if (brief.teamSize != null) facts.push(`${copy.teamSize}: ${brief.teamSize}`);
    if (Array.isArray(brief.constraints) && brief.constraints.length) {
      facts.push(`${copy.constraints}: ${brief.constraints.join(', ')}`);
    }
  }

  if (opening && facts.length) return `${opening}\n\n${facts.join('\n')}`;
  return opening || facts.join('\n');
}

function serializeLead(row: typeof leads.$inferSelect) {
  return {
    ...row,
    value: row.value != null ? String(row.value) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class LeadsService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private stages: PipelineStagesService,
    private contacts: ContactsService,
    private events: EventsService,
    private plugins: PluginRegistryService,
  ) {}

  async createFromSubmission(input: {
    contactId: string;
    submissionId: string;
    submissionData: Record<string, unknown>;
    formName: string;
    contactName?: string | null;
    contactEmail: string;
  }) {
    await this.stages.ensureDefaults();
    const firstStage = await this.stages.getFirstStage();

    const title = input.contactName?.trim() || input.contactEmail;
    const value = extractValueFromSubmission(input.submissionData);

    const [created] = await this.db
      .insert(leads)
      .values({
        contactId: input.contactId,
        submissionId: input.submissionId,
        stageId: firstStage.id,
        title,
        value,
        formName: input.formName,
        priority: 'medium',
      } as any)
      .returning();

    this.events.emit('lead.created', { stageId: firstStage.id, leadId: created.id });
    void this.plugins.emit({
      type: 'lead.created',
      payload: {
        id: created.id,
        title: created.title,
        email: input.contactEmail,
        name: input.contactName ?? null,
        stageId: firstStage.id,
        stageName: firstStage.name,
        value: created.value != null ? String(created.value) : null,
        priority: created.priority,
        formName: input.formName,
        contactId: input.contactId,
        createdAt: created.createdAt,
      },
    });

    return serializeLead(created);
  }

  async createFromInquiry(input: {
    inquiryId: string;
    contactId: string;
    contactName?: string | null;
    email: string;
    stageId?: string;
    companyName?: string | null;
    formName?: string | null;
    aiSummary?: string | null;
    proposedType?: string | null;
    tags?: string[];
    brief?: InquiryBrief | null;
    /** Adaptive contact-step values (ADR-0058) — also on inquiry.sourceMeta.contactFields. */
    contactFields?: Record<string, unknown> | null;
    /** Form-schema labels for contactFields, keyed by field name (ADR-0059). */
    fieldLabels?: Record<string, ContactFieldLabel | string> | null;
  }) {
    await this.stages.ensureDefaults();
    const stage = input.stageId
      ? await this.stages.findById(input.stageId)
      : await this.stages.getFirstStage();
    if (!stage) throw AppException.notFound('pipelineStage', input.stageId);

    const name = input.contactName?.trim() || '';
    const company = input.companyName?.trim() || '';
    const title = name && company ? `${name} · ${company}` : name || company || input.email;

    const [created] = await this.db
      .insert(leads)
      .values({
        contactId: input.contactId,
        submissionId: null,
        stageId: stage.id,
        title,
        value: null,
        priority: 'medium',
        formName: input.formName?.trim() || null,
      } as any)
      .returning();

    const intakeNote = buildInquiryIntakeComment({
      aiSummary: input.aiSummary,
      brief: input.brief,
      contactFields: input.contactFields,
      fieldLabels: input.fieldLabels,
    });
    if (intakeNote) {
      await this.db.insert(leadComments).values({
        leadId: created.id,
        userId: null,
        body: intakeNote,
      } as any);
    }

    this.events.emit('lead.created', { stageId: stage.id, leadId: created.id });
    void this.plugins.emit({
      type: 'lead.created',
      payload: {
        id: created.id,
        title: created.title,
        email: input.email,
        name: input.contactName ?? null,
        stageId: stage.id,
        stageName: stage.name,
        value: null,
        priority: created.priority,
        formName: created.formName,
        contactId: input.contactId,
        createdAt: created.createdAt,
      },
    });

    return serializeLead(created);
  }

  async createManual(dto: CreateLeadDto) {
    await this.stages.ensureDefaults();
    const stage = dto.stageId
      ? await this.stages.findById(dto.stageId)
      : await this.stages.getFirstStage();
    if (!stage) throw AppException.notFound('pipelineStage', dto.stageId);

    const contact = await this.contacts.upsertByEmail(dto.email, {
      name: dto.name,
    });

    const title = dto.title?.trim() || dto.name?.trim() || dto.email;

    const [created] = await this.db
      .insert(leads)
      .values({
        contactId: contact.id,
        submissionId: null,
        stageId: stage.id,
        ownerId: dto.ownerId ?? null,
        title,
        value: dto.value ?? null,
        priority: dto.priority ?? 'medium',
        formName: null,
      } as any)
      .returning();

    this.events.emit('lead.created', { stageId: stage.id, leadId: created.id });
    void this.plugins.emit({
      type: 'lead.created',
      payload: {
        id: created.id,
        title: created.title,
        email: contact.email,
        name: contact.name,
        stageId: stage.id,
        stageName: stage.name,
        value: created.value != null ? String(created.value) : null,
        priority: created.priority,
        formName: null,
        contactId: contact.id,
        createdAt: created.createdAt,
      },
    });

    return serializeLead(created);
  }

  async getBoard(ownerId?: string) {
    await this.stages.ensureDefaults();
    const stages = await this.stages.findAll();

    const conditions = ownerId ? eq(leads.ownerId, ownerId) : undefined;

    const rows = await this.db
      .select({
        id: leads.id,
        contactId: leads.contactId,
        submissionId: leads.submissionId,
        stageId: leads.stageId,
        ownerId: leads.ownerId,
        title: leads.title,
        value: leads.value,
        priority: leads.priority,
        formName: leads.formName,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
        contactEmail: contacts.email,
        contactName: contacts.name,
        ownerEmail: users.email,
      })
      .from(leads)
      .innerJoin(contacts, eq(leads.contactId, contacts.id))
      .leftJoin(users, eq(leads.ownerId, users.id))
      .where(conditions)
      .orderBy(desc(leads.updatedAt));

    const mailHints = await this.mailHintsForLeads(rows.map((r) => r.id));

    const columns = stages.map((stage) => {
      const stageLeads = rows
        .filter((r) => r.stageId === stage.id)
        .map((r) => {
          const hint = mailHints.get(r.id);
          return {
            id: r.id,
            contactId: r.contactId,
            submissionId: r.submissionId,
            stageId: r.stageId,
            ownerId: r.ownerId,
            title: r.title,
            value: r.value != null ? String(r.value) : null,
            priority: r.priority,
            formName: r.formName,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
            contactEmail: r.contactEmail,
            contactName: r.contactName,
            ownerEmail: r.ownerEmail,
            hasNewMail: hint?.hasNewMail ?? false,
            lastMailAt: hint?.lastMailAt ?? null,
          };
        });

      const totalValue = stageLeads.reduce((sum, l) => {
        const n = l.value ? Number(l.value) : 0;
        return sum + (Number.isNaN(n) ? 0 : n);
      }, 0);

      return {
        stage,
        leads: stageLeads,
        totalValue: String(totalValue),
        count: stageLeads.length,
      };
    });

    return { columns };
  }

  /**
   * Per-lead mail summary for the board: newest thread's latest message direction.
   * `hasNewMail` = that direction is inbound (contact wrote last).
   */
  private async mailHintsForLeads(
    leadIds: string[],
  ): Promise<Map<string, { hasNewMail: boolean; lastMailAt: string }>> {
    const out = new Map<string, { hasNewMail: boolean; lastMailAt: string }>();
    if (leadIds.length === 0) return out;

    const threads = await this.db
      .select({
        id: emailThreads.id,
        leadId: emailThreads.leadId,
        lastMessageAt: emailThreads.lastMessageAt,
      })
      .from(emailThreads)
      .where(and(isNotNull(emailThreads.leadId), inArray(emailThreads.leadId, leadIds)))
      .orderBy(desc(emailThreads.lastMessageAt));

    const newestThreadByLead = new Map<string, { threadId: string; lastMessageAt: Date }>();
    for (const t of threads) {
      if (!t.leadId) continue;
      if (newestThreadByLead.has(t.leadId)) continue;
      newestThreadByLead.set(t.leadId, { threadId: t.id, lastMessageAt: t.lastMessageAt });
    }

    const threadIds = [...newestThreadByLead.values()].map((v) => v.threadId);
    if (threadIds.length === 0) return out;

    const messages = await this.db
      .select({
        threadId: emailMessages.threadId,
        direction: emailMessages.direction,
        createdAt: emailMessages.createdAt,
      })
      .from(emailMessages)
      .where(inArray(emailMessages.threadId, threadIds))
      .orderBy(desc(emailMessages.createdAt));

    const directionByThread = new Map<string, string>();
    for (const m of messages) {
      if (directionByThread.has(m.threadId)) continue;
      directionByThread.set(m.threadId, m.direction);
    }

    for (const [leadId, meta] of newestThreadByLead) {
      const direction = directionByThread.get(meta.threadId);
      out.set(leadId, {
        hasNewMail: direction === 'inbound',
        lastMailAt: meta.lastMessageAt.toISOString(),
      });
    }

    return out;
  }

  async findById(id: string) {
    const [row] = await this.db
      .select({
        id: leads.id,
        contactId: leads.contactId,
        submissionId: leads.submissionId,
        stageId: leads.stageId,
        ownerId: leads.ownerId,
        title: leads.title,
        value: leads.value,
        priority: leads.priority,
        formName: leads.formName,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
        contactEmail: contacts.email,
        contactName: contacts.name,
        ownerEmail: users.email,
      })
      .from(leads)
      .innerJoin(contacts, eq(leads.contactId, contacts.id))
      .leftJoin(users, eq(leads.ownerId, users.id))
      .where(eq(leads.id, id))
      .limit(1);

    if (!row) return null;

    const mailHints = await this.mailHintsForLeads([id]);
    const hint = mailHints.get(id);

    let submission = null;
    if (row.submissionId) {
      const [sub] = await this.db
        .select()
        .from(submissions)
        .where(eq(submissions.id, row.submissionId))
        .limit(1);
      if (sub) {
        submission = {
          ...sub,
          createdAt: sub.createdAt.toISOString(),
        };
      }
    }

    const comments = await this.db
      .select({
        id: leadComments.id,
        leadId: leadComments.leadId,
        userId: leadComments.userId,
        body: leadComments.body,
        createdAt: leadComments.createdAt,
        userEmail: users.email,
      })
      .from(leadComments)
      .leftJoin(users, eq(leadComments.userId, users.id))
      .where(eq(leadComments.leadId, id))
      .orderBy(asc(leadComments.createdAt));

    const [inquiryOrigin] = await this.db
      .select({
        id: inquiries.id,
        aiSummary: inquiries.aiSummary,
        proposedType: inquiries.proposedType,
        companyName: inquiries.companyName,
        tags: inquiries.tags,
        structuredData: inquiries.structuredData,
        source: inquiries.source,
        sourceMeta: inquiries.sourceMeta,
        contactName: inquiries.contactName,
        email: inquiries.email,
      })
      .from(inquiries)
      .where(eq(inquiries.leadId, id))
      .limit(1);

    const originContactFields = (() => {
      const bag = (inquiryOrigin?.sourceMeta as { contactFields?: unknown } | null)?.contactFields;
      if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return null;
      return bag as Record<string, unknown>;
    })();

    return {
      id: row.id,
      contactId: row.contactId,
      submissionId: row.submissionId,
      stageId: row.stageId,
      ownerId: row.ownerId,
      title: row.title,
      value: row.value != null ? String(row.value) : null,
      priority: row.priority,
      formName: row.formName,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      contactEmail: row.contactEmail,
      contactName: row.contactName,
      ownerEmail: row.ownerEmail,
      hasNewMail: hint?.hasNewMail ?? false,
      lastMailAt: hint?.lastMailAt ?? null,
      submission,
      inquiryOrigin: inquiryOrigin
        ? {
            id: inquiryOrigin.id,
            aiSummary: inquiryOrigin.aiSummary,
            proposedType: inquiryOrigin.proposedType,
            companyName: inquiryOrigin.companyName,
            contactName: inquiryOrigin.contactName,
            email: inquiryOrigin.email,
            tags: inquiryOrigin.tags ?? [],
            structuredData: {
              ...EMPTY_INQUIRY_BRIEF,
              ...(inquiryOrigin.structuredData ?? {}),
              currentTools: Array.isArray(inquiryOrigin.structuredData?.currentTools)
                ? inquiryOrigin.structuredData.currentTools
                : [],
              constraints: Array.isArray(inquiryOrigin.structuredData?.constraints)
                ? inquiryOrigin.structuredData.constraints
                : [],
            },
            contactFields: originContactFields,
            source: inquiryOrigin.source,
          }
        : null,
      comments: comments.map((c) => ({
        id: c.id,
        leadId: c.leadId,
        userId: c.userId,
        userEmail: c.userEmail,
        body: c.body,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  async update(id: string, dto: UpdateLeadDto) {
    const existing = await this.findById(id);
    if (!existing) throw AppException.notFound('lead', id);

    if (dto.stageId) {
      const stage = await this.stages.findById(dto.stageId);
      if (!stage) throw AppException.notFound('pipelineStage', dto.stageId);
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.value !== undefined) patch.value = dto.value;
    if (dto.priority !== undefined) patch.priority = dto.priority;
    if (dto.stageId !== undefined) patch.stageId = dto.stageId;
    if (dto.ownerId !== undefined) patch.ownerId = dto.ownerId;

    await this.db
      .update(leads)
      .set(patch as any)
      .where(eq(leads.id, id));

    if (dto.stageId !== undefined && dto.stageId !== existing.stageId) {
      const oldStage = await this.stages.findById(existing.stageId);
      const newStage = await this.stages.findById(dto.stageId);
      this.events.emit('lead.moved', {
        leadId: id,
        oldStageId: existing.stageId,
        newStageId: dto.stageId,
      });
      void this.plugins.emit({
        type: 'lead.moved',
        payload: {
          id,
          title: dto.title ?? existing.title,
          email: existing.contactEmail,
          name: existing.contactName,
          oldStageId: existing.stageId,
          oldStageName: oldStage?.name ?? existing.stageId,
          newStageId: dto.stageId,
          newStageName: newStage?.name ?? dto.stageId,
        },
      });
    }

    return this.findById(id);
  }

  async delete(id: string) {
    const existing = await this.findById(id);
    if (!existing) throw AppException.notFound('lead', id);

    const stage = await this.stages.findById(existing.stageId);
    await this.db.delete(leads).where(eq(leads.id, id));
    this.events.emit('lead.deleted', { leadId: id, stageId: existing.stageId });
    void this.plugins.emit({
      type: 'lead.deleted',
      payload: {
        id,
        title: existing.title,
        email: existing.contactEmail,
        stageId: existing.stageId,
        stageName: stage?.name ?? existing.stageId,
      },
    });
    return { deleted: true };
  }

  async addComment(leadId: string, userId: string, body: string) {
    const existing = await this.findById(leadId);
    if (!existing) throw AppException.notFound('lead', leadId);

    const [comment] = await this.db
      .insert(leadComments)
      .values({ leadId, userId, body } as any)
      .returning();

    await this.db
      .update(leads)
      .set({ updatedAt: new Date() } as any)
      .where(eq(leads.id, leadId));

    const [withUser] = await this.db
      .select({
        id: leadComments.id,
        leadId: leadComments.leadId,
        userId: leadComments.userId,
        body: leadComments.body,
        createdAt: leadComments.createdAt,
        userEmail: users.email,
      })
      .from(leadComments)
      .leftJoin(users, eq(leadComments.userId, users.id))
      .where(eq(leadComments.id, comment.id))
      .limit(1);

    return {
      id: withUser.id,
      leadId: withUser.leadId,
      userId: withUser.userId,
      userEmail: withUser.userEmail,
      body: withUser.body,
      createdAt: withUser.createdAt.toISOString(),
    };
  }

  async getAssignees() {
    const rows = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .orderBy(asc(users.email));
    return rows;
  }
}
