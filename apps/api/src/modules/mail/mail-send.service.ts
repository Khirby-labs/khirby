import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, asc } from 'drizzle-orm';
import * as nodemailer from 'nodemailer';
import { randomUUID } from 'crypto';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import { emailMessages, emailThreads, contacts, leads } from '../../core/database/schema';
import { MailboxService } from './mailbox.service';
import { MailThreadService } from './mail-thread.service';
import { PluginRegistryService } from '../plugins/plugin-registry.service';
import { EventsService } from '../../core/events/events.service';
import { AppException } from '../../core/errors/app-exception';
import { smtpTransportOptions, formatSmtpError } from './mail-smtp-options';

export interface SendMailInput {
  contactId?: string;
  leadId?: string;
  toAddress?: string;
  subject: string;
  bodyText: string;
  sentByUserId: string;
}

export interface ReplyMailInput {
  threadId: string;
  bodyText: string;
  sentByUserId: string;
}

@Injectable()
export class MailSendService {
  private readonly logger = new Logger(MailSendService.name);

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly mailboxSvc: MailboxService,
    private readonly threadSvc: MailThreadService,
    private readonly plugins: PluginRegistryService,
    private readonly events: EventsService,
  ) {}

  async createThread(input: SendMailInput): Promise<{ threadId: string; messageId: string }> {
    const creds = await this.mailboxSvc.getDecryptedCredentials();
    if (!creds) {
      throw AppException.badRequest(
        'Mailbox is not configured or disabled. Connect and enable it in Settings → Mail.',
      );
    }

    let toAddress = input.toAddress;
    let contactId = input.contactId ?? null;
    const leadId = input.leadId ?? null;

    // From a lead panel we often get leadId without contactId — resolve the contact email.
    if (!contactId && leadId) {
      const [lead] = await this.db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
      if (!lead) throw AppException.notFound('lead', leadId);
      contactId = lead.contactId;
    }

    if (contactId) {
      const [contact] = await this.db
        .select()
        .from(contacts)
        .where(eq(contacts.id, contactId))
        .limit(1);
      if (!contact) throw AppException.notFound('contact', contactId);
      toAddress = contact.email;
    }

    if (!toAddress) {
      throw AppException.badRequest('Recipient email address is required.');
    }

    const messageId = `crm-${randomUUID()}@crm.local`;

    const [thread] = await this.db
      .insert(emailThreads)
      .values({
        mailboxId: creds.mailbox.id,
        contactId,
        leadId,
        subject: input.subject,
        rootMessageId: messageId,
        lastMessageAt: new Date(),
      } as any)
      .returning();

    const [msg] = await this.db
      .insert(emailMessages)
      .values({
        threadId: thread.id,
        mailboxId: creds.mailbox.id,
        direction: 'outbound',
        status: 'pending',
        messageId,
        inReplyTo: null,
        references: null,
        fromAddress: creds.mailbox.fromAddress,
        toAddresses: [toAddress],
        ccAddresses: [],
        subject: input.subject,
        bodyText: input.bodyText,
        sentByUserId: input.sentByUserId,
      } as any)
      .returning();

    const transportResult = await this.sendViaSmtp({
      creds,
      messageId,
      inReplyTo: undefined,
      references: undefined,
      from: this.formatFrom(creds.mailbox),
      to: toAddress,
      subject: input.subject,
      text: input.bodyText,
    });

    if (transportResult.ok && transportResult.sentMessageId) {
      await this.db
        .update(emailMessages)
        .set({
          status: 'sent',
          sentAt: new Date(),
          messageId: transportResult.sentMessageId,
        } as any)
        .where(eq(emailMessages.id, msg.id));

      const eventPayload = {
        messageId: transportResult.sentMessageId,
        threadId: thread.id,
        mailboxId: creds.mailbox.id,
        fromAddress: creds.mailbox.fromAddress,
        toAddresses: [toAddress],
        subject: input.subject,
        bodyText: input.bodyText,
        contactId,
        leadId,
        sentByUserId: input.sentByUserId,
        sentAt: new Date(),
      };
      void this.plugins.emit({ type: 'email.sent', payload: eventPayload });
      this.events.emit('email.sent', {
        threadId: thread.id,
        contactId,
        leadId,
        messageId: transportResult.sentMessageId,
      });
    } else {
      await this.db
        .update(emailMessages)
        .set({ status: 'failed', lastError: transportResult.error ?? 'Unknown error' } as any)
        .where(eq(emailMessages.id, msg.id));
      this.logger.error(`SMTP send failed: ${transportResult.error}`);
    }

    return { threadId: thread.id, messageId: msg.id };
  }

  async reply(input: ReplyMailInput): Promise<{ messageId: string }> {
    const creds = await this.mailboxSvc.getDecryptedCredentials();
    if (!creds) {
      throw AppException.badRequest(
        'Mailbox is not configured or disabled. Connect and enable it in Settings → Mail.',
      );
    }

    const [thread] = await this.db
      .select()
      .from(emailThreads)
      .where(eq(emailThreads.id, input.threadId))
      .limit(1);

    if (!thread) throw AppException.notFound('emailThread', input.threadId);

    // Find messages in ascending order for In-Reply-To and recipient resolution
    const prevMessages = await this.db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.threadId, input.threadId))
      .orderBy(asc(emailMessages.createdAt));

    const firstMsg = prevMessages[0];
    const lastMsg = prevMessages[prevMessages.length - 1];
    const inReplyTo = lastMsg?.messageId;
    const allMessageIds = prevMessages.map((m) => m.messageId).filter(Boolean);
    const references = allMessageIds.map((id) => `<${id.replace(/^<|>$/g, '')}>`).join(' ');

    // Determine recipient: reply-to first message's fromAddress
    const toAddress =
      firstMsg?.direction === 'inbound' ? firstMsg.fromAddress : (firstMsg?.toAddresses[0] ?? '');

    if (!toAddress) {
      throw AppException.badRequest('Cannot determine reply recipient.');
    }

    const messageId = `crm-${randomUUID()}@crm.local`;

    const [msg] = await this.db
      .insert(emailMessages)
      .values({
        threadId: thread.id,
        mailboxId: creds.mailbox.id,
        direction: 'outbound',
        status: 'pending',
        messageId,
        inReplyTo: inReplyTo ?? null,
        references: references || null,
        fromAddress: creds.mailbox.fromAddress,
        toAddresses: [toAddress],
        ccAddresses: [],
        subject: `Re: ${thread.subject}`,
        bodyText: input.bodyText,
        sentByUserId: input.sentByUserId,
      } as any)
      .returning();

    const transportResult = await this.sendViaSmtp({
      creds,
      messageId,
      inReplyTo,
      references: references || undefined,
      from: this.formatFrom(creds.mailbox),
      to: toAddress,
      subject: `Re: ${thread.subject}`,
      text: input.bodyText,
    });

    if (transportResult.ok && transportResult.sentMessageId) {
      await this.db
        .update(emailMessages)
        .set({
          status: 'sent',
          sentAt: new Date(),
          messageId: transportResult.sentMessageId,
        } as any)
        .where(eq(emailMessages.id, msg.id));

      await this.db
        .update(emailThreads)
        .set({ lastMessageAt: new Date(), updatedAt: new Date() } as any)
        .where(eq(emailThreads.id, thread.id));

      void this.plugins.emit({
        type: 'email.sent',
        payload: {
          messageId: transportResult.sentMessageId,
          threadId: thread.id,
          mailboxId: creds.mailbox.id,
          fromAddress: creds.mailbox.fromAddress,
          toAddresses: [toAddress],
          subject: `Re: ${thread.subject}`,
          bodyText: input.bodyText,
          contactId: thread.contactId ?? null,
          leadId: thread.leadId ?? null,
          sentByUserId: input.sentByUserId,
          sentAt: new Date(),
        },
      });
      this.events.emit('email.sent', {
        threadId: thread.id,
        contactId: thread.contactId ?? null,
        leadId: thread.leadId ?? null,
        messageId: transportResult.sentMessageId,
      });
    } else {
      await this.db
        .update(emailMessages)
        .set({ status: 'failed', lastError: transportResult.error ?? 'Unknown error' } as any)
        .where(eq(emailMessages.id, msg.id));
      this.logger.error(`SMTP reply failed: ${transportResult.error}`);
    }

    return { messageId: msg.id };
  }

  /** Prefer display name so clients show "Bearly CRM" instead of bare address. */
  private formatFrom(mailbox: { fromName: string; name: string; fromAddress: string }): string {
    const display = (mailbox.fromName || mailbox.name || '').trim();
    if (!display) return mailbox.fromAddress;
    const escaped = display.replace(/"/g, '\\"');
    return `"${escaped}" <${mailbox.fromAddress}>`;
  }

  private async sendViaSmtp(opts: {
    creds: Awaited<ReturnType<MailboxService['getDecryptedCredentials']>> & {};
    messageId: string;
    inReplyTo?: string;
    references?: string;
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<{ ok: boolean; sentMessageId?: string; error?: string }> {
    const { creds } = opts;
    if (!creds) {
      return { ok: false, error: 'Mailbox is not configured or disabled.' };
    }

    const transportCfg =
      creds.authMethod === 'google_oauth'
        ? {
            host: creds.mailbox.smtpHost,
            port: creds.mailbox.smtpPort,
            secure: creds.mailbox.smtpSecure,
            user: creds.mailbox.smtpUser,
            clientId: creds.clientId,
            clientSecret: creds.clientSecret,
            refreshToken: creds.refreshToken,
            accessToken: creds.accessToken,
          }
        : {
            host: creds.mailbox.smtpHost,
            port: creds.mailbox.smtpPort,
            secure: creds.mailbox.smtpSecure,
            user: creds.mailbox.smtpUser,
            password: creds.smtpPassword,
          };

    const transporter = nodemailer.createTransport(smtpTransportOptions(transportCfg));

    try {
      const mailOptions: nodemailer.SendMailOptions = {
        messageId: `<${opts.messageId}>`,
        from: opts.from,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
      };
      if (opts.inReplyTo) mailOptions['In-Reply-To'] = `<${opts.inReplyTo}>`;
      if (opts.references) {
        mailOptions['References'] = opts.references
          .split(/\s+/)
          .filter(Boolean)
          .map((id) => `<${id.replace(/^<|>$/g, '')}>`)
          .join(' ');
      }

      const info = await transporter.sendMail(mailOptions);
      const sentId =
        typeof info.messageId === 'string' ? info.messageId.replace(/^<|>$/g, '') : opts.messageId;
      return { ok: true, sentMessageId: sentId };
    } catch (err) {
      return { ok: false, error: formatSmtpError(err) };
    } finally {
      transporter.close();
    }
  }
}
