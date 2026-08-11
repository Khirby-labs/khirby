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
