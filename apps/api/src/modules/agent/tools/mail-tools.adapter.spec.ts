import { Test } from '@nestjs/testing';
import { MailToolsAdapter } from './mail-tools.adapter';
import { MailThreadService } from '../../mail/mail-thread.service';
import { MailSendService } from '../../mail/mail-send.service';
import { MailboxService } from '../../mail/mailbox.service';
import { RbacService } from '../../../core/rbac/rbac.service';

describe('MailToolsAdapter', () => {
  let adapter: MailToolsAdapter;
  let rbac: jest.Mocked<Pick<RbacService, 'hasPermission'>>;
  let threads: jest.Mocked<Pick<MailThreadService, 'listThreads' | 'getThread'>>;
  let send: jest.Mocked<Pick<MailSendService, 'createThread' | 'reply'>>;
  let mailbox: jest.Mocked<Pick<MailboxService, 'get'>>;

  beforeEach(async () => {
    rbac = {
      hasPermission: jest.fn(
        async (_uid, resource, _action) => resource === 'leads' || resource === 'contacts',
      ),
    };
    threads = {
      listThreads: jest.fn().mockResolvedValue({
        total: 1,
        items: [
          {
            id: 'thread-1',
            subject: 'Follow up',
            contactEmail: 'a@acme.com',
            contactName: 'Ann',
            leadId: 'lead-1',
            leadTitle: 'Acme',
            lastMessageAt: '2026-08-20T10:00:00.000Z',
            messageCount: 2,
            lastDirection: 'inbound',
          },
        ],
      }),
      getThread: jest.fn().mockResolvedValue({
        id: 'thread-1',
        subject: 'Follow up',
        contactEmail: 'a@acme.com',
        contactName: 'Ann',
        leadId: 'lead-1',
        leadTitle: 'Acme',
        lastMessageAt: '2026-08-20T10:00:00.000Z',
        messageCount: 1,
        lastDirection: 'inbound',
        messages: [
          {
            id: 'msg-1',
            direction: 'inbound',
            status: 'received',
            fromAddress: 'a@acme.com',
            toAddresses: ['inbox@crm.test'],
            subject: 'Follow up',
            bodyText: 'Hello there',
            sentAt: '2026-08-20T10:00:00.000Z',
            createdAt: '2026-08-20T10:00:00.000Z',
          },
        ],
      }),
    };
    send = {
      createThread: jest.fn().mockResolvedValue({ threadId: 'thread-2', messageId: 'msg-2' }),
      reply: jest.fn().mockResolvedValue({ messageId: 'msg-3' }),
    };
    mailbox = {
      get: jest.fn().mockResolvedValue({
        mailbox: {
          enabled: true,
          fromAddress: 'inbox@crm.test',
          authMethod: 'password',
        },
        googleOAuthConfigured: false,
        secretsKeyConfigured: true,
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MailToolsAdapter,
        { provide: MailThreadService, useValue: threads },
        { provide: MailSendService, useValue: send },
        { provide: MailboxService, useValue: mailbox },
        { provide: RbacService, useValue: rbac },
      ],
    }).compile();

    adapter = moduleRef.get(MailToolsAdapter);
  });

  it('exposes mail tool definitions', () => {
    const names = adapter.definitions().map((d) => d.function.name);
    expect(names).toContain('list_mail_threads');
    expect(names).toContain('send_mail');
  });

  it('returns forbidden without leads/contacts manage', async () => {
    rbac.hasPermission.mockResolvedValue(false);
    const result = await adapter.run('user-1', 'list_mail_threads', {});
    expect(result).toEqual({ ok: false, code: 'forbidden', summary: 'Forbidden' });
  });

  it('lists threads with ids and subject', async () => {
    const result = await adapter.run('user-1', 'list_mail_threads', {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toContain('thread-1');
      expect(result.summary).toContain('Follow up');
      expect(result.summary).toContain('a@acme.com');
    }
  });

  it('gets thread with message body preview', async () => {
    const result = await adapter.run('user-1', 'get_mail_thread', { id: 'thread-1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toContain('Hello there');
      expect(result.summary).toContain('direction=inbound');
    }
  });

  it('sends mail with user id', async () => {
    const result = await adapter.run('user-1', 'send_mail', {
      subject: 'Hi',
      bodyText: 'Body',
      leadId: 'lead-1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.summary).toContain('thread-2');
    expect(send.createThread).toHaveBeenCalledWith(
      expect.objectContaining({ sentByUserId: 'user-1', leadId: 'lead-1' }),
    );
  });

  it('reports mailbox status', async () => {
    const result = await adapter.run('user-1', 'get_mailbox_status', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.summary).toContain('inbox@crm.test');
  });
});
