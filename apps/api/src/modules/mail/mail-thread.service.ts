import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { createHash } from 'crypto';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import {
  emailThreads,
  emailMessages,
  contacts,
  leads,
  pipelineStages,
} from '../../core/database/schema';
import { AppException } from '../../core/errors/app-exception';
import { EventsService } from '../../core/events/events.service';
import { LeadsService } from '../leads/leads.service';
import type { CaptureAsLeadDto } from './dto/capture-as-lead.dto';

export type IngestMessageInput = {
  mailboxId: string;
  rawMessageId?: string;
  inReplyTo?: string;
  references?: string;
  fromAddress: string;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  sentAt?: Date;
  receivedAt?: Date;
  imapUid?: number;
  hasAttachments?: boolean;
};

/** Normalize an RFC Message-ID: strip <>, whitespace */
export function normalizeMessageId(raw: string | undefined | null): string | null {
  if (!raw) return null;
  return raw.trim().replace(/^<|>$/g, '').trim() || null;
}

/** Generate a synthetic Message-ID when the message has none */
export function syntheticMessageId(input: {
  mailboxId: string;
  fromAddress: string;
  toAddresses: string[];
  subject: string;
  date?: Date;
}): string {
  const payload = [
    input.mailboxId,
    input.fromAddress,
    input.toAddresses.join(','),
    input.subject,
    input.date?.toISOString() ?? '',
  ].join('\0');
  return createHash('sha256').update(payload).digest('hex');
}

@Injectable()
export class MailThreadService {
  private readonly logger = new Logger(MailThreadService.name);

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly events: EventsService,
    private readonly leadsService: LeadsService,
  ) {}

  async listThreads(opts: {
    contactId?: string;
    leadId?: string;
    page?: number;
    pageSize?: number;
    mailboxId?: string;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];
    if (opts.contactId) conditions.push(eq(emailThreads.contactId, opts.contactId));
    if (opts.leadId) conditions.push(eq(emailThreads.leadId, opts.leadId));
    if (opts.mailboxId) conditions.push(eq(emailThreads.mailboxId, opts.mailboxId));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ count }] = await this.db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(emailThreads)
      .where(whereClause);

    const items = await this.db
      .select({
        id: emailThreads.id,
        mailboxId: emailThreads.mailboxId,
        contactId: emailThreads.contactId,
        leadId: emailThreads.leadId,
        subject: emailThreads.subject,
        lastMessageAt: emailThreads.lastMessageAt,
        createdAt: emailThreads.createdAt,
        contactEmail: contacts.email,
        contactName: contacts.name,
        leadTitle: leads.title,
        messageCount: sql<number>`(SELECT count(*)::int FROM email_messages WHERE thread_id = ${emailThreads.id})`,
        lastDirection: sql<
          string | null
        >`(SELECT direction FROM email_messages WHERE thread_id = ${emailThreads.id} ORDER BY created_at DESC LIMIT 1)`,
      })
      .from(emailThreads)
      .leftJoin(contacts, eq(emailThreads.contactId, contacts.id))
      .leftJoin(leads, eq(emailThreads.leadId, leads.id))
      .where(whereClause)
      .orderBy(desc(emailThreads.lastMessageAt))
      .limit(pageSize)
      .offset(offset);

    return {
      items: items.map((item) =>
        serializeThreadSummary({
          ...item,
          contactEmail: item.contactEmail ?? null,
          contactName: item.contactName ?? null,
          leadTitle: item.leadTitle ?? null,
          messageCount: item.messageCount ?? 0,
          lastDirection: (item.lastDirection ?? 'outbound') as 'inbound' | 'outbound',
        }),
      ),
      total: count,
      page,
      pageSize,
    };
  }

  /**
   * Hard-delete a thread (and cascaded messages) from the CRM mailbox.
   * Does not expunge IMAP (v1).
   */
  async deleteThread(threadId: string): Promise<{ leadId: string | null }> {
    const [thread] = await this.db
      .select({ id: emailThreads.id, leadId: emailThreads.leadId })
      .from(emailThreads)
      .where(eq(emailThreads.id, threadId))
      .limit(1);

    if (!thread) throw AppException.notFound('emailThread', threadId);

    const leadId = thread.leadId ?? null;
    await this.db.delete(emailThreads).where(eq(emailThreads.id, threadId));

    this.events.emit('email.deleted', {
      threadId,
      leadId,
      threadDeleted: true,
    });
    return { leadId };
  }

  async getThread(id: string) {
    const [thread] = await this.db
      .select()
      .from(emailThreads)
      .where(eq(emailThreads.id, id))
      .limit(1);

    if (!thread) throw AppException.notFound('emailThread', id);

    const messages = await this.db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.threadId, id))
      .orderBy(asc(emailMessages.createdAt));

    const [contact] = thread.contactId
      ? await this.db
          .select({ email: contacts.email, name: contacts.name })
          .from(contacts)
          .where(eq(contacts.id, thread.contactId))
          .limit(1)
      : [null];

    const [lead] = thread.leadId
      ? await this.db
          .select({ title: leads.title })
          .from(leads)
          .where(eq(leads.id, thread.leadId))
          .limit(1)
      : [null];

    const newest = messages[messages.length - 1];
    return {
      ...serializeThreadSummary({
        id: thread.id,
        mailboxId: thread.mailboxId,
        contactId: thread.contactId ?? null,
        leadId: thread.leadId ?? null,
        subject: thread.subject,
        lastMessageAt: thread.lastMessageAt,
        createdAt: thread.createdAt,
        contactEmail: contact?.email ?? null,
        contactName: contact?.name ?? null,
        leadTitle: lead?.title ?? null,
        messageCount: messages.length,
        lastDirection: (newest?.direction ?? 'outbound') as 'inbound' | 'outbound',
      }),
      messages: messages.map(serializeMessage),
    };
  }

  /**
   * Ingest an inbound message: dedupe by Message-ID, resolve contact/lead, thread via headers.
   * Returns the created/found message id, threadId, contactId, leadId, and isNew flag.
   */
  async ingestMessage(input: IngestMessageInput): Promise<{
    messageId: string;
    threadId: string;
    contactId: string | null;
    leadId: string | null;
    isNew: boolean;
  }> {
    const rawMid = normalizeMessageId(input.rawMessageId);
    const messageId =
      rawMid ??
      syntheticMessageId({
        mailboxId: input.mailboxId,
        fromAddress: input.fromAddress,
        toAddresses: input.toAddresses,
        subject: input.subject,
        date: input.receivedAt ?? input.sentAt,
      });

    // Dedupe: if message already stored, skip
    const [existing] = await this.db
      .select({ id: emailMessages.id, threadId: emailMessages.threadId })
      .from(emailMessages)
      .where(
        and(eq(emailMessages.mailboxId, input.mailboxId), eq(emailMessages.messageId, messageId)),
      )
      .limit(1);

    if (existing) {
      const [existingThread] = await this.db
        .select({ contactId: emailThreads.contactId, leadId: emailThreads.leadId })
        .from(emailThreads)
        .where(eq(emailThreads.id, existing.threadId))
        .limit(1);
      return {
        messageId: existing.id,
        threadId: existing.threadId,
        contactId: existingThread?.contactId ?? null,
        leadId: existingThread?.leadId ?? null,
        isNew: false,
      };
    }

    // Resolve contact by fromAddress
    const fromNorm = input.fromAddress.toLowerCase().trim();
    const [contact] = await this.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.email, fromNorm))
      .limit(1);

    const contactId = contact?.id ?? null;

    // Resolve lead: most recent open lead for this contact
    let leadId: string | null = null;
    if (contactId) {
      leadId = await this.resolveOpenLead(contactId);
    }

    // Find or create thread
    const threadId = await this.findOrCreateThread({
      mailboxId: input.mailboxId,
      contactId,
      leadId,
      subject: input.subject,
      rootMessageId: messageId,
      inReplyTo: input.inReplyTo,
      references: input.references,
      messageAt: input.receivedAt ?? input.sentAt ?? new Date(),
    });

    // Insert message
    const bodyHtml = input.bodyHtml
      ? input.bodyHtml.slice(0, 200 * 1024) // cap at ~200 KB
      : undefined;

    const [msg] = await this.db
      .insert(emailMessages)
      .values({
        threadId,
        mailboxId: input.mailboxId,
        direction: 'inbound',
        status: 'sent',
        messageId,
        inReplyTo: normalizeMessageId(input.inReplyTo) ?? null,
        references: input.references ?? null,
        fromAddress: input.fromAddress,
        toAddresses: input.toAddresses,
        ccAddresses: input.ccAddresses,
        subject: input.subject,
        bodyText: input.bodyText,
        bodyHtml: bodyHtml ?? null,
        sentAt: input.sentAt ?? null,
        receivedAt: input.receivedAt ?? null,
        imapUid: input.imapUid ?? null,
        hasAttachments: input.hasAttachments ?? false,
      } as any)
      .returning({ id: emailMessages.id });

    // Update thread's lastMessageAt
    await this.db
      .update(emailThreads)
      .set({
        lastMessageAt: input.receivedAt ?? input.sentAt ?? new Date(),
        updatedAt: new Date(),
      } as any)
      .where(eq(emailThreads.id, threadId));

    return { messageId: msg.id, threadId, contactId, leadId, isNew: true };
  }

  /**
   * Create contact + lead from an unknown-sender thread and link the thread.
   * Email defaults to the first inbound From address (lowercased).
   */
  async captureAsLead(threadId: string, dto: CaptureAsLeadDto) {
    const [thread] = await this.db
      .select({
        id: emailThreads.id,
        contactId: emailThreads.contactId,
        subject: emailThreads.subject,
      })
      .from(emailThreads)
      .where(eq(emailThreads.id, threadId))
      .limit(1);

    if (!thread) throw AppException.notFound('emailThread', threadId);
    if (thread.contactId) {
      throw AppException.badRequest('Thread is already linked to a contact', {
        entity: 'emailThread',
        id: threadId,
      });
    }

    const email = (dto.email?.trim() || (await this.resolveInboundSenderEmail(threadId)))
      .toLowerCase()
      .trim();

    if (!email || !email.includes('@')) {
      throw AppException.badRequest('No inbound sender address found on this thread', {
        entity: 'emailThread',
        id: threadId,
      });
    }

    const lead = await this.leadsService.createManual({
      email,
      name: dto.name,
      title: dto.title?.trim() || dto.name?.trim() || thread.subject || email,
      value: dto.value,
      priority: dto.priority,
      stageId: dto.stageId,
      ownerId: dto.ownerId,
    });

    await this.db
      .update(emailThreads)
      .set({
        contactId: lead.contactId,
        leadId: lead.id,
        updatedAt: new Date(),
      } as any)
      .where(eq(emailThreads.id, threadId));

    return this.getThread(threadId);
  }

  /** First inbound message From address, or empty string. */
  private async resolveInboundSenderEmail(threadId: string): Promise<string> {
    const messages = await this.db
      .select({
        direction: emailMessages.direction,
        fromAddress: emailMessages.fromAddress,
      })
      .from(emailMessages)
      .where(eq(emailMessages.threadId, threadId))
      .orderBy(asc(emailMessages.createdAt));

    const inbound = messages.find((m) => m.direction === 'inbound');
    return extractEmailAddress(inbound?.fromAddress ?? '');
  }

  /** Find most recent open lead for a contact */
  async resolveOpenLead(contactId: string): Promise<string | null> {
    const rows = await this.db
      .select({ id: leads.id })
      .from(leads)
      .innerJoin(pipelineStages, eq(leads.stageId, pipelineStages.id))
      .where(
        and(
          eq(leads.contactId, contactId),
          eq(pipelineStages.isWon, false),
          eq(pipelineStages.isLost, false),
        ),
      )
      .orderBy(desc(leads.updatedAt))
      .limit(1);

    return rows[0]?.id ?? null;
  }

  private async findOrCreateThread(opts: {
    mailboxId: string;
    contactId: string | null;
    leadId: string | null;
    subject: string;
    rootMessageId: string;
    inReplyTo?: string;
    references?: string;
    messageAt: Date;
  }): Promise<string> {
    // Try to find thread by In-Reply-To or References headers first
    const refIds = this.parseReferences(opts.inReplyTo, opts.references);

    if (refIds.length > 0) {
      // Look for a message with any of those IDs in the same mailbox
      for (const refId of refIds) {
        const norm = normalizeMessageId(refId);
        if (!norm) continue;
        const [msg] = await this.db
          .select({ threadId: emailMessages.threadId })
          .from(emailMessages)
          .where(
            and(eq(emailMessages.mailboxId, opts.mailboxId), eq(emailMessages.messageId, norm)),
          )
          .limit(1);
        if (msg) return msg.threadId;
      }
    }

    // No existing thread found — create new
    const [thread] = await this.db
      .insert(emailThreads)
      .values({
        mailboxId: opts.mailboxId,
        contactId: opts.contactId,
        leadId: opts.leadId,
        subject: opts.subject,
        rootMessageId: opts.rootMessageId,
        lastMessageAt: opts.messageAt,
      } as any)
      .returning({ id: emailThreads.id });

    return thread.id;
  }

  private parseReferences(inReplyTo?: string, references?: string): string[] {
    const ids: string[] = [];
    if (inReplyTo) {
      const norm = normalizeMessageId(inReplyTo);
      if (norm) ids.push(norm);
    }
    if (references) {
      const parts = references.split(/\s+/);
      for (const p of parts) {
        const norm = normalizeMessageId(p);
        if (norm) ids.push(norm);
      }
    }
    return ids;
  }
}

function serializeThreadSummary(data: {
  id: string;
  mailboxId: string;
  contactId: string | null;
  leadId: string | null;
  subject: string;
  lastMessageAt: Date;
  createdAt: Date;
  contactEmail: string | null;
  contactName: string | null;
  leadTitle: string | null;
  messageCount: number;
  lastDirection: 'inbound' | 'outbound';
}) {
  return {
    id: data.id,
    subject: data.subject,
    contactId: data.contactId,
    contactEmail: data.contactEmail,
    contactName: data.contactName,
    leadId: data.leadId,
    leadTitle: data.leadTitle,
    lastMessageAt: data.lastMessageAt.toISOString(),
    messageCount: data.messageCount,
    lastDirection: data.lastDirection,
    createdAt: data.createdAt.toISOString(),
  };
}

function serializeMessage(row: typeof emailMessages.$inferSelect) {
  return {
    id: row.id,
    threadId: row.threadId,
    mailboxId: row.mailboxId,
    direction: row.direction,
    status: row.status,
    messageId: row.messageId,
    inReplyTo: row.inReplyTo ?? null,
    fromAddress: row.fromAddress,
    toAddresses: row.toAddresses,
    ccAddresses: row.ccAddresses,
    subject: row.subject,
    bodyText: row.bodyText,
    // bodyHtml intentionally omitted — XSS guard (v1)
    sentAt: row.sentAt?.toISOString() ?? null,
    receivedAt: row.receivedAt?.toISOString() ?? null,
    imapUid: row.imapUid ?? null,
    sentByUserId: row.sentByUserId ?? null,
    lastError: row.lastError ?? null,
    hasAttachments: row.hasAttachments,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Pull a bare email from `Name <addr>` or return the trimmed string. */
export function extractEmailAddress(raw: string): string {
  const trimmed = raw.trim();
  const angle = trimmed.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim();
  return trimmed;
}
