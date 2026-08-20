import { Injectable } from '@nestjs/common';
import { MailThreadService } from '../../mail/mail-thread.service';
import { MailSendService } from '../../mail/mail-send.service';
import { MailboxService } from '../../mail/mailbox.service';
import { RbacService } from '../../../core/rbac/rbac.service';
import type { LlmToolDef } from '../agent-llm.client';
import type { ToolRunResult } from './crm-tools.adapter';

@Injectable()
export class MailToolsAdapter {
  constructor(
    private threads: MailThreadService,
    private send: MailSendService,
    private mailbox: MailboxService,
    private rbac: RbacService,
  ) {}

  definitions(): LlmToolDef[] {
    return [
      tool('get_mailbox_status', 'Check whether the firm mailbox is configured and enabled', {
        type: 'object',
        properties: {},
      }),
      tool(
        'list_mail_threads',
        'List email threads with id, subject, contact, lead, last activity, and direction',
        {
          type: 'object',
          properties: {
            contactId: {
              type: 'string',
              description: 'Optional contact UUID from search_contacts',
            },
            leadId: { type: 'string', description: 'Optional lead UUID from search_leads' },
            page: { type: 'number' },
          },
        },
      ),
      tool(
        'get_mail_thread',
        'Get one email thread with messages (use id from list_mail_threads)',
        {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      ),
      tool(
        'send_mail',
        'Send a new email (requires configured mailbox). Provide contactId, leadId, or toAddress.',
        {
          type: 'object',
          properties: {
            subject: { type: 'string' },
            bodyText: { type: 'string' },
            contactId: { type: 'string' },
            leadId: { type: 'string' },
            toAddress: { type: 'string' },
          },
          required: ['subject', 'bodyText'],
        },
      ),
      tool('reply_mail_thread', 'Reply in an existing thread (use id from list_mail_threads)', {
        type: 'object',
        properties: {
          threadId: { type: 'string' },
          bodyText: { type: 'string' },
        },
        required: ['threadId', 'bodyText'],
      }),
    ];
  }

  async run(userId: string, name: string, args: Record<string, unknown>): Promise<ToolRunResult> {
    if (!(await this.canUseMail(userId))) {
      return { ok: false, code: 'forbidden', summary: 'Forbidden' };
    }

    try {
      switch (name) {
        case 'get_mailbox_status': {
          const status = await this.mailbox.get();
          const mb = status.mailbox;
          if (!mb) {
            return {
              ok: true,
              summary:
                'Mailbox not configured. Connect it in Settings → Mail before sending or syncing email.',
            };
          }
          const parts = [
            `configured=yes`,
            `enabled=${mb.enabled ? 'yes' : 'no'}`,
            `address=${mb.fromAddress}`,
            `auth=${mb.authMethod}`,
          ];
          if (!mb.enabled) {
            parts.push('hint=Enable mailbox in Settings → Mail to send/receive');
          }
          return { ok: true, summary: parts.join(' | ') };
        }
        case 'list_mail_threads': {
          const data = await this.threads.listThreads({
            contactId: args.contactId ? String(args.contactId) : undefined,
            leadId: args.leadId ? String(args.leadId) : undefined,
            page: args.page ? Number(args.page) : 1,
            pageSize: 10,
          });
          const items = data.items ?? [];
          if (!items.length) {
            return { ok: true, summary: 'No email threads found for this filter.' };
          }
          const lines = items.map(formatThreadLine);
          return {
            ok: true,
            summary: `${data.total ?? items.length} thread(s), showing ${lines.length}:\n${lines.join('\n')}`,
          };
        }
        case 'get_mail_thread': {
          const id = String(args.id ?? '').trim();
          if (!id) return { ok: false, code: 'invalid_args', summary: 'Thread id is required' };
          const thread = await this.threads.getThread(id);
          return { ok: true, summary: formatThreadDetail(thread) };
        }
        case 'send_mail': {
          const subject = String(args.subject ?? '').trim();
          const bodyText = String(args.bodyText ?? '').trim();
          if (!subject || !bodyText) {
            return {
              ok: false,
              code: 'invalid_args',
              summary: 'subject and bodyText are required',
            };
          }
          const result = await this.send.createThread({
            subject,
            bodyText,
            contactId: args.contactId ? String(args.contactId) : undefined,
            leadId: args.leadId ? String(args.leadId) : undefined,
            toAddress: args.toAddress ? String(args.toAddress) : undefined,
            sentByUserId: userId,
          });
          return {
            ok: true,
            summary: `Sent | threadId=${result.threadId} | messageId=${result.messageId}`,
          };
        }
        case 'reply_mail_thread': {
          const threadId = String(args.threadId ?? '').trim();
          const bodyText = String(args.bodyText ?? '').trim();
          if (!threadId || !bodyText) {
            return {
              ok: false,
              code: 'invalid_args',
              summary: 'threadId and bodyText are required',
            };
          }
          const result = await this.send.reply({
            threadId,
            bodyText,
            sentByUserId: userId,
          });
          return {
            ok: true,
            summary: `Replied | threadId=${threadId} | messageId=${result.messageId}`,
          };
        }
        default:
          return { ok: false, code: 'unknown_tool', summary: 'Unknown tool' };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Tool failed';
      return { ok: false, code: 'tool_error', summary: message.slice(0, 300) };
    }
  }

  private async canUseMail(userId: string): Promise<boolean> {
    return (
      (await this.rbac.hasPermission(userId, 'leads', 'manage')) ||
      (await this.rbac.hasPermission(userId, 'contacts', 'manage'))
    );
  }
}

function tool(name: string, description: string, parameters: Record<string, unknown>): LlmToolDef {
  return { type: 'function', function: { name, description, parameters } };
}

type ThreadSummary = {
  id: string;
  subject: string;
  contactEmail: string | null;
  contactName: string | null;
  leadId: string | null;
  leadTitle: string | null;
  lastMessageAt: string;
  messageCount: number;
  lastDirection: string;
};

function formatThreadLine(thread: ThreadSummary): string {
  const parts = [
    `id=${thread.id}`,
    `subject=${thread.subject?.trim() || '(no subject)'}`,
    `lastAt=${thread.lastMessageAt}`,
    `direction=${thread.lastDirection}`,
    `messages=${thread.messageCount}`,
  ];
  if (thread.contactName || thread.contactEmail) {
    parts.push(`contact=${thread.contactName?.trim() || thread.contactEmail}`);
  }
  if (thread.contactEmail) parts.push(`email=${thread.contactEmail}`);
  if (thread.leadTitle) parts.push(`lead=${thread.leadTitle}`);
  if (thread.leadId) parts.push(`leadId=${thread.leadId}`);
  return `- ${parts.join(' | ')}`;
}

type ThreadMessage = {
  id: string;
  direction: string;
  status: string;
  fromAddress: string;
  toAddresses: string[];
  subject: string;
  bodyText: string;
  sentAt: string | null;
  createdAt: string;
};

function formatThreadDetail(thread: ThreadSummary & { messages?: ThreadMessage[] }): string {
  const header = formatThreadLine(thread).replace(/^- /, '');
  const messages = thread.messages ?? [];
  if (!messages.length) return header;

  const lines = messages.map((msg, index) => {
    const preview = truncateBody(msg.bodyText);
    return [
      `msg${index + 1}`,
      `id=${msg.id}`,
      `direction=${msg.direction}`,
      `status=${msg.status}`,
      `from=${msg.fromAddress}`,
      `at=${msg.sentAt ?? msg.createdAt}`,
      `body=${preview}`,
    ].join(' | ');
  });

  return `${header}\n${lines.join('\n')}`;
}

function truncateBody(body: string, max = 400): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}…`;
}
