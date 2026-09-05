jest.mock('nodemailer');

import { Test, TestingModule } from '@nestjs/testing';
import { MailSendService } from './mail-send.service';
import { MailboxService } from './mailbox.service';
import { MailThreadService } from './mail-thread.service';
import { PluginRegistryService } from '../plugins/plugin-registry.service';
import { EventsService } from '../../core/events/events.service';
import { DB_TOKEN } from '../../core/database/database.module';
import * as nodemailer from 'nodemailer';

const mockCreateTransport = nodemailer.createTransport as jest.Mock;

function makeChain(result: any[] = []) {
  const chain: any = {};
  [
    'from',
    'where',
    'limit',
    'offset',
    'values',
    'set',
    'returning',
    'innerJoin',
    'leftJoin',
    'orderBy',
  ].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return chain;
}

function buildDb() {
  const db: any = {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  db.select.mockImplementation(() => makeChain([]));
  db.insert.mockImplementation(() => makeChain([]));
  db.update.mockImplementation(() => makeChain([]));
  db.delete.mockImplementation(() => makeChain([]));
  return db;
}

const mockCreds = {
  authMethod: 'password' as const,
  mailbox: {
    id: 'mb1',
    fromName: 'CRM',
    name: 'CRM',
    fromAddress: 'crm@example.com',
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: 'crm@example.com',
  },
  imapPassword: 'imappass',
  smtpPassword: 'smtppass',
};

describe('MailSendService', () => {
  let service: MailSendService;
  let module: TestingModule;
  let db: ReturnType<typeof buildDb>;
  let mailboxSvc: jest.Mocked<Pick<MailboxService, 'getDecryptedCredentials'>>;
  let plugins: { emit: jest.Mock };
  let events: { emit: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    db = buildDb();
    mailboxSvc = {
      getDecryptedCredentials: jest.fn().mockResolvedValue(mockCreds),
    };
    plugins = { emit: jest.fn() };
    events = { emit: jest.fn() };

    module = await Test.createTestingModule({
      providers: [
        MailSendService,
        { provide: DB_TOKEN, useValue: db },
        { provide: MailboxService, useValue: mailboxSvc },
        { provide: MailThreadService, useValue: {} },
        { provide: PluginRegistryService, useValue: plugins },
        { provide: EventsService, useValue: events },
      ],
    }).compile();

    service = module.get(MailSendService);
  });

  afterEach(async () => {
    await module?.close();
  });

  describe('createThread', () => {
    it('throws when mailbox is not configured', async () => {
      mailboxSvc.getDecryptedCredentials.mockResolvedValueOnce(null);
      await expect(
        service.createThread({
          toAddress: 'a@b.com',
          subject: 'Hello',
          bodyText: 'Hi',
          sentByUserId: 'user-1',
        }),
      ).rejects.toThrow();
    });

    it('stores pending then failed when SMTP fails', async () => {
      db.insert
        .mockImplementationOnce(() => makeChain([{ id: 'thread-1' }]))
        .mockImplementationOnce(() => makeChain([{ id: 'msg-1' }]));

      const failingTransporter = {
        sendMail: jest.fn().mockRejectedValue(new Error('SMTP connection refused')),
        close: jest.fn(),
      };
      mockCreateTransport.mockReturnValueOnce(failingTransporter);

      db.update.mockImplementationOnce(() => makeChain([]));

      await expect(
        service.createThread({
          toAddress: 'a@b.com',
          subject: 'Hello',
          bodyText: 'Hi',
          sentByUserId: 'user-1',
        }),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'UPSTREAM_FAILED' }) });

      expect(db.update).toHaveBeenCalled();
    });

    it('stores pending then sent when SMTP succeeds', async () => {
      db.insert
        .mockImplementationOnce(() => makeChain([{ id: 'thread-2' }]))
        .mockImplementationOnce(() => makeChain([{ id: 'msg-2' }]));

      const okTransporter = {
        sendMail: jest.fn().mockResolvedValue({ messageId: '<sent-id@domain>' }),
        close: jest.fn(),
      };
      mockCreateTransport.mockReturnValueOnce(okTransporter);

      db.update.mockImplementationOnce(() => makeChain([]));

      const result = await service.createThread({
        toAddress: 'b@c.com',
        subject: 'Test',
        bodyText: 'Body',
        sentByUserId: 'user-1',
      });

      expect(result.threadId).toBe('thread-2');
      expect(plugins.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'email.sent' }));
      expect(events.emit).toHaveBeenCalledWith(
        'email.sent',
        expect.objectContaining({ threadId: 'thread-2' }),
      );
      expect(okTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: '"CRM" <crm@example.com>' }),
      );
    });

    it('resolves recipient from leadId when contactId is omitted', async () => {
      db.select
        .mockImplementationOnce(() => makeChain([{ id: 'lead-1', contactId: 'c1' }]))
        .mockImplementationOnce(() => makeChain([{ id: 'c1', email: 'lead-contact@example.com' }]));
      db.insert
        .mockImplementationOnce(() => makeChain([{ id: 'thread-3' }]))
        .mockImplementationOnce(() => makeChain([{ id: 'msg-3' }]));

      const okTransporter = {
        sendMail: jest.fn().mockResolvedValue({ messageId: '<m3@domain>' }),
        close: jest.fn(),
      };
      mockCreateTransport.mockReturnValueOnce(okTransporter);
      db.update.mockImplementationOnce(() => makeChain([]));

      const result = await service.createThread({
        leadId: 'lead-1',
        subject: 'From lead',
        bodyText: 'Hi',
        sentByUserId: 'user-1',
      });

      expect(result.threadId).toBe('thread-3');
      expect(okTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'lead-contact@example.com' }),
      );
    });
  });
  it('records reply failure and rejects instead of reporting success', async () => {
    db.select
      .mockImplementationOnce(() => makeChain([{ id: 'thread', subject: 'Hello' }]))
      .mockImplementationOnce(() =>
        makeChain([
          {
            direction: 'inbound',
            fromAddress: 'sender@example.invalid',
            messageId: 'original@example.invalid',
          },
        ]),
      );
    db.insert.mockImplementationOnce(() => makeChain([{ id: 'failed-reply' }]));
    const failedUpdate = makeChain([]);
    db.update.mockReturnValueOnce(failedUpdate);
    mockCreateTransport.mockReturnValueOnce({
      sendMail: jest.fn().mockRejectedValue(new Error('SMTP unavailable')),
      close: jest.fn(),
    });
    await expect(
      service.reply({ threadId: 'thread', bodyText: 'Reply', sentByUserId: 'user' }),
    ).rejects.toMatchObject({ response: { code: 'UPSTREAM_FAILED' } });
    expect(failedUpdate.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('emits real MIME reply headers through Nodemailer', async () => {
    const real = jest.requireActual('nodemailer');
    const transport = real.createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'unix',
    });
    let mime = '';
    mockCreateTransport.mockReturnValueOnce({
      sendMail: async (options: any) => {
        const result = await transport.sendMail(options);
        mime = result.message.toString();
        return result;
      },
      close: () => transport.close(),
    });
    const result = await (service as any).sendViaSmtp({
      creds: mockCreds,
      messageId: 'reply@example.invalid',
      inReplyTo: '<original@example.invalid>',
      references: '<first@example.invalid> <original@example.invalid>',
      from: 'crm@example.invalid',
      to: 'sender@example.invalid',
      subject: 'Re: Hello',
      text: 'Reply',
    });
    expect(result.ok).toBe(true);
    expect(mime).toContain('In-Reply-To: <original@example.invalid>');
    expect(mime.replace(/\n[ \t]+/g, ' ')).toContain(
      'References: <first@example.invalid> <original@example.invalid>',
    );
  });
});
