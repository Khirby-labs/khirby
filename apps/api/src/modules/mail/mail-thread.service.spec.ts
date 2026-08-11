import { Test, TestingModule } from '@nestjs/testing';
import {
  MailThreadService,
  normalizeMessageId,
  syntheticMessageId,
  extractEmailAddress,
} from './mail-thread.service';
import { DB_TOKEN } from '../../core/database/database.module';
import { EventsService } from '../../core/events/events.service';
import { LeadsService } from '../leads/leads.service';

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

describe('normalizeMessageId', () => {
  it('strips angle brackets', () => {
    expect(normalizeMessageId('<abc@example.com>')).toBe('abc@example.com');
  });

  it('strips whitespace', () => {
    expect(normalizeMessageId('  <abc@example.com>  ')).toBe('abc@example.com');
  });

  it('returns null for empty/undefined', () => {
    expect(normalizeMessageId(null)).toBeNull();
    expect(normalizeMessageId(undefined)).toBeNull();
    expect(normalizeMessageId('')).toBeNull();
  });

  it('handles already-normalized id', () => {
    expect(normalizeMessageId('abc@example.com')).toBe('abc@example.com');
  });
});

describe('extractEmailAddress', () => {
  it('extracts address from display-name form', () => {
    expect(extractEmailAddress('Ada Lovelace <ada@example.com>')).toBe('ada@example.com');
  });

  it('returns bare address unchanged', () => {
    expect(extractEmailAddress('ada@example.com')).toBe('ada@example.com');
  });
});

describe('syntheticMessageId', () => {
  it('produces a hex string', () => {
    const id = syntheticMessageId({
      mailboxId: 'mb1',
      fromAddress: 'a@b.com',
      toAddresses: ['c@d.com'],
      subject: 'Test',
    });
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for same input', () => {
    const input = {
      mailboxId: 'mb1',
      fromAddress: 'a@b.com',
      toAddresses: ['c@d.com'],
      subject: 'Test',
      date: new Date('2026-01-01'),
    };
    expect(syntheticMessageId(input)).toBe(syntheticMessageId(input));
  });

  it('differs for different inputs', () => {
    const base = {
      mailboxId: 'mb1',
      fromAddress: 'a@b.com',
      toAddresses: ['c@d.com'],
      subject: 'Test',
    };
    const id1 = syntheticMessageId(base);
    const id2 = syntheticMessageId({ ...base, fromAddress: 'x@y.com' });
    expect(id1).not.toBe(id2);
  });
});

describe('MailThreadService', () => {
  let service: MailThreadService;
  let db: ReturnType<typeof buildDb>;
  let events: { emit: jest.Mock };
  let leadsService: { createManual: jest.Mock };

  beforeEach(async () => {
    db = buildDb();
    events = { emit: jest.fn() };
    leadsService = { createManual: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailThreadService,
        { provide: DB_TOKEN, useValue: db },
        { provide: EventsService, useValue: events },
        { provide: LeadsService, useValue: leadsService },
      ],
    }).compile();
    service = module.get(MailThreadService);
  });

  describe('resolveOpenLead', () => {
    it('returns null when no open lead exists', async () => {
      db.select.mockImplementationOnce(() => makeChain([]));
      const result = await service.resolveOpenLead('contact-1');
      expect(result).toBeNull();
    });

    it('returns lead id when open lead exists', async () => {
      db.select.mockImplementationOnce(() => makeChain([{ id: 'lead-1' }]));
      const result = await service.resolveOpenLead('contact-1');
      expect(result).toBe('lead-1');
    });
  });

  describe('ingestMessage', () => {
    const baseInput = {
      mailboxId: 'mb1',
      rawMessageId: '<msg1@example.com>',
      fromAddress: 'sender@example.com',
      toAddresses: ['firm@example.com'],
      ccAddresses: [],
      subject: 'Hello',
      bodyText: 'Hi there',
      receivedAt: new Date('2026-01-01'),
    };

    it('skips duplicate message (same messageId)', async () => {
      db.select.mockImplementationOnce(() => makeChain([{ id: 'existing-msg' }]));
      const result = await service.ingestMessage(baseInput);
      expect(result.isNew).toBe(false);
      expect(result.messageId).toBe('existing-msg');
    });

    it('creates new thread and message for fresh inbound', async () => {
      db.select
        .mockImplementationOnce(() => makeChain([]))
        .mockImplementationOnce(() => makeChain([{ id: 'contact-1' }]))
        .mockImplementationOnce(() => makeChain([{ id: 'lead-1' }]));

      db.insert
        .mockImplementationOnce(() => makeChain([{ id: 'thread-1' }]))
        .mockImplementationOnce(() => makeChain([{ id: 'new-msg-id' }]));

      db.update.mockImplementationOnce(() => makeChain([]));

      const result = await service.ingestMessage(baseInput);
      expect(result.isNew).toBe(true);
      expect(result.messageId).toBe('new-msg-id');
    });

    it('uses synthetic messageId when rawMessageId is missing', async () => {
      const input = { ...baseInput, rawMessageId: undefined };

      db.select
        .mockImplementationOnce(() => makeChain([]))
        .mockImplementationOnce(() => makeChain([]));

      db.insert
        .mockImplementationOnce(() => makeChain([{ id: 'thread-2' }]))
        .mockImplementationOnce(() => makeChain([{ id: 'synthetic-msg' }]));

      db.update.mockImplementationOnce(() => makeChain([]));

      const result = await service.ingestMessage(input);
      expect(result.isNew).toBe(true);
    });
  });

  describe('getThread', () => {
    it('throws not found for missing thread', async () => {
      db.select.mockImplementationOnce(() => makeChain([]));
      await expect(service.getThread('nonexistent')).rejects.toThrow();
    });

    it('returns thread with messages (no bodyHtml in response)', async () => {
      const thread = {
        id: 't1',
        mailboxId: 'mb1',
        contactId: 'c1',
        leadId: null,
        subject: 'Hello',
        rootMessageId: 'msg1',
        lastMessageAt: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      };
      const message = {
        id: 'm1',
        threadId: 't1',
        mailboxId: 'mb1',
        direction: 'inbound',
        status: 'sent',
        messageId: 'msg1',
        inReplyTo: null,
        references: null,
        fromAddress: 'a@b.com',
        toAddresses: [],
        ccAddresses: [],
        subject: 'Hello',
        bodyText: 'Hi',
        bodyHtml: '<b>Hi</b>',
        sentAt: null,
        receivedAt: new Date('2026-01-01'),
        imapUid: 5,
        sentByUserId: null,
        lastError: null,
        hasAttachments: false,
        createdAt: new Date('2026-01-01'),
      };
      db.select
        .mockImplementationOnce(() => makeChain([thread]))
        .mockImplementationOnce(() => makeChain([message]));

      const result = await service.getThread('t1');
      expect(result.id).toBe('t1');
      expect(result.messages[0]).not.toHaveProperty('bodyHtml');
    });
  });

  describe('captureAsLead', () => {
    it('throws when thread is missing', async () => {
      db.select.mockImplementationOnce(() => makeChain([]));
      await expect(service.captureAsLead('missing', {})).rejects.toThrow();
      expect(leadsService.createManual).not.toHaveBeenCalled();
    });

    it('throws when thread is already linked', async () => {
      db.select.mockImplementationOnce(() =>
        makeChain([{ id: 't1', contactId: 'c1', subject: 'Hi' }]),
      );
      await expect(service.captureAsLead('t1', {})).rejects.toThrow(/already linked/);
      expect(leadsService.createManual).not.toHaveBeenCalled();
    });

    it('throws when no sender email can be resolved', async () => {
      db.select
        .mockImplementationOnce(() => makeChain([{ id: 't1', contactId: null, subject: 'Hi' }]))
        .mockImplementationOnce(() => makeChain([]));
      await expect(service.captureAsLead('t1', {})).rejects.toThrow(/No inbound sender/);
      expect(leadsService.createManual).not.toHaveBeenCalled();
    });

    it('creates lead, links thread, returns updated detail', async () => {
      leadsService.createManual.mockResolvedValue({
        id: 'lead-1',
        contactId: 'c-new',
        title: 'Hi',
      });

      const linkedThread = {
        id: 't1',
        mailboxId: 'mb1',
        contactId: 'c-new',
        leadId: 'lead-1',
        subject: 'Hi',
        rootMessageId: 'msg1',
        lastMessageAt: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      };
      const message = {
        id: 'm1',
        threadId: 't1',
        mailboxId: 'mb1',
        direction: 'inbound',
        status: 'sent',
        messageId: 'msg1',
        inReplyTo: null,
        references: null,
        fromAddress: 'Sender <Buyer@Example.COM>',
        toAddresses: [],
        ccAddresses: [],
        subject: 'Hi',
        bodyText: 'Hello, I am Jan Kowalski',
        bodyHtml: null,
        sentAt: null,
        receivedAt: new Date('2026-01-01'),
        imapUid: 1,
        sentByUserId: null,
        lastError: null,
        hasAttachments: false,
        createdAt: new Date('2026-01-01'),
      };

      db.select
        .mockImplementationOnce(() => makeChain([{ id: 't1', contactId: null, subject: 'Hi' }]))
        .mockImplementationOnce(() =>
          makeChain([{ direction: 'inbound', fromAddress: 'Sender <Buyer@Example.COM>' }]),
        )
        .mockImplementationOnce(() => makeChain([linkedThread]))
        .mockImplementationOnce(() => makeChain([message]))
        .mockImplementationOnce(() => makeChain([{ email: 'buyer@example.com', name: 'Jan' }]))
        .mockImplementationOnce(() => makeChain([{ title: 'Hi' }]));

      db.update.mockImplementationOnce(() => makeChain([]));

      const result = await service.captureAsLead('t1', { name: 'Jan Kowalski' });

      expect(leadsService.createManual).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'buyer@example.com',
          name: 'Jan Kowalski',
          title: 'Jan Kowalski',
        }),
      );
      expect(db.update).toHaveBeenCalled();
      expect(result.contactId).toBe('c-new');
      expect(result.leadId).toBe('lead-1');
      expect(result.contactEmail).toBe('buyer@example.com');
    });
  });

  describe('deleteThread', () => {
    it('throws when thread is missing', async () => {
      db.select.mockImplementationOnce(() => makeChain([]));
      await expect(service.deleteThread('t-missing')).rejects.toThrow();
      expect(db.delete).not.toHaveBeenCalled();
    });

    it('deletes the thread and emits email.deleted', async () => {
      db.select.mockImplementationOnce(() => makeChain([{ id: 't1', leadId: 'lead-1' }]));
      db.delete.mockImplementationOnce(() => makeChain([]));

      const result = await service.deleteThread('t1');
      expect(result).toEqual({ leadId: 'lead-1' });
      expect(db.delete).toHaveBeenCalledTimes(1);
      expect(events.emit).toHaveBeenCalledWith(
        'email.deleted',
        expect.objectContaining({ threadId: 't1', threadDeleted: true, leadId: 'lead-1' }),
      );
    });
  });
});
