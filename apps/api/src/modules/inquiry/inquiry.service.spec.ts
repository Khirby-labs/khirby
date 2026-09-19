import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InquiryService } from './inquiry.service';
import { ContactsService } from '../contacts/contacts.service';
import { LeadsService } from '../leads/leads.service';
import { EventsService } from '../../core/events/events.service';
import { PluginRegistryService } from '../plugins/plugin-registry.service';
import { DB_TOKEN } from '../../core/database/database.module';

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

function buildDb(txOverride?: any) {
  const db: any = {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    execute: jest.fn().mockResolvedValue([]),
    transaction: jest.fn(),
  };
  db.select.mockImplementation(() => makeChain([]));
  db.insert.mockImplementation(() => makeChain([]));
  db.update.mockImplementation(() => makeChain([]));
  db.delete.mockImplementation(() => makeChain([]));
  // Default transaction mock: run the callback with the db itself (or override)
  db.transaction.mockImplementation(async (fn: any) => fn(txOverride ?? db));
  return db;
}

const ACTIVE_INQUIRY = {
  id: 'inq-1',
  publicToken: 'tok-1',
  formId: null,
  source: null,
  sourceMeta: {},
  status: 'active',
  contactName: 'Alice',
  email: 'alice@example.com',
  companyName: null,
  structuredData: {},
  aiSummary: null,
  proposedType: null,
  missingInformation: [],
  tags: [],
  aiMetadata: {},
  reviewedAt: null,
  reviewedBy: null,
  leadId: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const READY_INQUIRY = { ...ACTIVE_INQUIRY, status: 'ready_for_review' };
const ACCEPTED_INQUIRY = { ...ACTIVE_INQUIRY, status: 'accepted', leadId: 'lead-1' };
const REJECTED_INQUIRY = { ...ACTIVE_INQUIRY, status: 'rejected' };
const SPAM_INQUIRY = { ...ACTIVE_INQUIRY, status: 'spam' };
const INQUIRY_NO_EMAIL = { ...READY_INQUIRY, email: null };

describe('InquiryService', () => {
  let service: InquiryService;
  let module: TestingModule;
  let db: ReturnType<typeof buildDb>;
  let contacts: jest.Mocked<Pick<ContactsService, 'upsertByEmail'>>;
  let leads: jest.Mocked<Pick<LeadsService, 'createFromInquiry'>>;
  let events: { emit: jest.Mock };
  let plugins: { emit: jest.Mock };

  beforeEach(async () => {
    db = buildDb();
    contacts = {
      upsertByEmail: jest
        .fn()
        .mockResolvedValue({ id: 'c1', email: 'alice@example.com', name: 'Alice' }),
    };
    leads = {
      createFromInquiry: jest.fn().mockResolvedValue({
        id: 'lead-1',
        title: 'Alice',
        createdAt: new Date('2026-01-01').toISOString(),
        updatedAt: new Date('2026-01-01').toISOString(),
      }),
    };
    events = { emit: jest.fn() };
    plugins = { emit: jest.fn() };

    module = await Test.createTestingModule({
      providers: [
        InquiryService,
        { provide: DB_TOKEN, useValue: db },
        { provide: ContactsService, useValue: contacts },
        { provide: LeadsService, useValue: leads },
        { provide: EventsService, useValue: events },
        { provide: PluginRegistryService, useValue: plugins },
        { provide: ModuleRef, useValue: {} },
      ],
    }).compile();

    service = module.get(InquiryService);
  });

  afterEach(async () => {
    await module?.close();
  });

  // ── transition ──────────────────────────────────────────────────────────────

  describe('transition', () => {
    it('allows active → ready_for_review', async () => {
      db.select.mockImplementationOnce(() => makeChain([ACTIVE_INQUIRY]));
      db.update.mockImplementationOnce(() => makeChain([]));
      db.select.mockImplementationOnce(() =>
        makeChain([{ ...ACTIVE_INQUIRY, status: 'ready_for_review' }]),
      );

      const result = await service.transition('inq-1', 'ready_for_review');

      expect(result?.status).toBe('ready_for_review');
    });

    it('allows active → rejected and sets reviewedAt when actorId given', async () => {
      db.select.mockImplementationOnce(() => makeChain([ACTIVE_INQUIRY]));
      const updatedRow = {
        ...ACTIVE_INQUIRY,
        status: 'rejected',
        reviewedAt: new Date(),
        reviewedBy: 'user-1',
      };
      db.update.mockImplementationOnce(() => makeChain([]));
      db.select.mockImplementationOnce(() => makeChain([updatedRow]));

      await service.transition('inq-1', 'rejected', { actorId: 'user-1' });

      const setCall = db.update.mock.results[0].value.set;
      expect(setCall).toHaveBeenCalledWith(expect.objectContaining({ reviewedBy: 'user-1' }));
    });

    it('allows ready_for_review → rejected', async () => {
      db.select.mockImplementationOnce(() => makeChain([READY_INQUIRY]));
      db.update.mockImplementationOnce(() => makeChain([]));
      db.select.mockImplementationOnce(() => makeChain([{ ...READY_INQUIRY, status: 'rejected' }]));

      const result = await service.transition('inq-1', 'rejected');
      expect(result?.status).toBe('rejected');
    });

    it('throws 409 when inquiry is already terminal (rejected)', async () => {
      db.select.mockImplementationOnce(() => makeChain([REJECTED_INQUIRY]));

      await expect(service.transition('inq-1', 'spam')).rejects.toThrow(ConflictException);
    });

    it('throws 409 when inquiry is already terminal (accepted)', async () => {
      db.select.mockImplementationOnce(() => makeChain([ACCEPTED_INQUIRY]));

      await expect(service.transition('inq-1', 'rejected')).rejects.toThrow(ConflictException);
    });

    it('throws 409 when inquiry is already terminal (spam)', async () => {
      db.select.mockImplementationOnce(() => makeChain([SPAM_INQUIRY]));

      await expect(service.transition('inq-1', 'rejected')).rejects.toThrow(ConflictException);
    });

    it('throws 404 when inquiry not found', async () => {
      db.select.mockImplementationOnce(() => makeChain([]));

      await expect(service.transition('missing', 'ready_for_review')).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  // ── accept ──────────────────────────────────────────────────────────────────

  describe('accept', () => {
    it('accepts a ready_for_review inquiry: creates contact and lead', async () => {
      // Inside transaction: same db mock
      db.select
        .mockImplementationOnce(() => makeChain([READY_INQUIRY])) // load for update
        .mockImplementationOnce(() => makeChain([])); // unused
      db.update
        .mockImplementationOnce(() => makeChain([{ ...READY_INQUIRY, status: 'accepted' }])) // CAS
        .mockImplementationOnce(() => makeChain([])); // set leadId
      db.execute.mockResolvedValueOnce([]); // advisory lock

      const result = await service.accept('inq-1', 'user-1');

      expect(contacts.upsertByEmail).toHaveBeenCalledWith('alice@example.com', { name: 'Alice' });
      expect(leads.createFromInquiry).toHaveBeenCalledWith(
        expect.objectContaining({ inquiryId: 'inq-1', email: 'alice@example.com' }),
      );
      expect(result.leadId).toBe('lead-1');
      expect(events.emit).toHaveBeenCalledWith(
        'inquiry.accepted',
        expect.objectContaining({ id: 'inq-1' }),
      );
    });

    it('is idempotent when already accepted with a leadId', async () => {
      db.select.mockImplementationOnce(() => makeChain([ACCEPTED_INQUIRY]));
      db.execute.mockResolvedValueOnce([]); // advisory lock

      const result = await service.accept('inq-1', 'user-1');

      expect(contacts.upsertByEmail).not.toHaveBeenCalled();
      expect(leads.createFromInquiry).not.toHaveBeenCalled();
      expect(result.status).toBe('accepted');
    });

    it('throws 400 when email is missing', async () => {
      db.select.mockImplementationOnce(() => makeChain([INQUIRY_NO_EMAIL]));
      db.execute.mockResolvedValueOnce([]); // advisory lock

      await expect(service.accept('inq-1', 'user-1')).rejects.toMatchObject({ status: 400 });
      expect(contacts.upsertByEmail).not.toHaveBeenCalled();
    });

    it('throws 409 when status is not ready_for_review (e.g. active)', async () => {
      db.select.mockImplementationOnce(() => makeChain([ACTIVE_INQUIRY]));
      db.execute.mockResolvedValueOnce([]); // advisory lock

      await expect(service.accept('inq-1', 'user-1')).rejects.toThrow(ConflictException);
      expect(contacts.upsertByEmail).not.toHaveBeenCalled();
    });
  });

  // ── reject ──────────────────────────────────────────────────────────────────

  describe('reject', () => {
    it('rejects ready_for_review inquiry and does not call upsertByEmail', async () => {
      db.select.mockImplementationOnce(() => makeChain([READY_INQUIRY]));
      db.update.mockImplementationOnce(() => makeChain([]));
      db.select.mockImplementationOnce(() => makeChain([{ ...READY_INQUIRY, status: 'rejected' }]));

      await service.reject('inq-1', 'user-1');

      expect(contacts.upsertByEmail).not.toHaveBeenCalled();
      expect(leads.createFromInquiry).not.toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(
        'inquiry.rejected',
        expect.objectContaining({ id: 'inq-1' }),
      );
    });
  });

  // ── createFromForm ──────────────────────────────────────────────────────────

  describe('createFromForm', () => {
    it('inserts an active inquiry and emits inquiry.created', async () => {
      db.insert.mockImplementationOnce(() => makeChain([ACTIVE_INQUIRY]));

      const result = await service.createFromForm({
        email: 'alice@example.com',
        contactName: 'Alice',
      });

      expect(result.status).toBe('active');
      expect(events.emit).toHaveBeenCalledWith(
        'inquiry.created',
        expect.objectContaining({ id: 'inq-1' }),
      );
    });
  });

  // ── appendMessage ────────────────────────────────────────────────────────────

  describe('appendMessage', () => {
    it('appends message to active inquiry', async () => {
      const msg = {
        id: 'msg-1',
        inquiryId: 'inq-1',
        role: 'visitor',
        content: 'Hi',
        metadata: null,
        createdAt: new Date(),
      };
      db.select.mockImplementationOnce(() => makeChain([ACTIVE_INQUIRY]));
      db.insert.mockImplementationOnce(() => makeChain([msg]));

      const result = await service.appendMessage('inq-1', { role: 'visitor', content: 'Hi' });

      expect(result.id).toBe('msg-1');
    });

    it('throws 400 when inquiry is not active', async () => {
      db.select.mockImplementationOnce(() => makeChain([READY_INQUIRY]));

      await expect(
        service.appendMessage('inq-1', { role: 'visitor', content: 'Hi' }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  // ── submitAdaptiveIntake (public one-shot) ─────────────────────────────────

  describe('submitAdaptiveIntake', () => {
    it('rejects mismatched questions/answers length', async () => {
      await expect(
        service.submitAdaptiveIntake({
          formId: 'form-1',
          opening: 'Need a CRM for our growing sales team.',
          questions: ['Q1?', 'Q2?'],
          answers: ['A1'],
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('rejects a too-short opening before writing', async () => {
      await expect(
        service.submitAdaptiveIntake({
          formId: 'form-1',
          opening: 'hi',
          questions: ['Q1?'],
          answers: ['A1'],
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('creates inquiry + transcript + ready_for_review in one flow', async () => {
      const mockAssistant = {
        planQuestions: jest.fn(),
        process: jest.fn(),
        finalize: jest.fn().mockResolvedValue({
          summary: 'CRM for a small team',
          proposedType: 'CRM',
          tags: ['crm'],
        }),
      };

      const mockModuleRef = {
        get: jest.fn().mockReturnValue(mockAssistant),
        container: {
          getModules: jest.fn().mockReturnValue(
            new Map([
              [
                'ai',
                {
                  hasProvider: () => true,
                  getProviderByKey: () => ({ instance: mockAssistant }),
                },
              ],
            ]),
          ),
        },
      };

      const mod2 = await Test.createTestingModule({
        providers: [
          InquiryService,
          { provide: DB_TOKEN, useValue: db },
          { provide: ContactsService, useValue: contacts },
          { provide: LeadsService, useValue: leads },
          { provide: EventsService, useValue: events },
          { provide: PluginRegistryService, useValue: plugins },
          { provide: ModuleRef, useValue: mockModuleRef },
        ],
      }).compile();
      const svc2 = mod2.get(InquiryService);

      const createdRow = {
        ...ACTIVE_INQUIRY,
        formId: 'form-1',
        status: 'active',
        email: 'ada@example.com',
        contactName: 'Ada',
      };
      const readyRow = {
        ...createdRow,
        status: 'ready_for_review',
        aiSummary: 'CRM for a small team',
      };

      db.select
        .mockImplementationOnce(() =>
          makeChain([{ openingLabels: { en: 'What brings you here?', pl: null } }]),
        ) // opening label
        .mockImplementationOnce(() => makeChain([createdRow])) // ensureAiFields load inquiry
        .mockImplementationOnce(() =>
          makeChain([
            { role: 'assistant', content: 'What brings you here?' },
            { role: 'visitor', content: 'Need CRM' },
            { role: 'assistant', content: 'Q1?' },
            { role: 'visitor', content: 'A1' },
            { role: 'assistant', content: 'Q2?' },
            { role: 'visitor', content: 'A2' },
            { role: 'assistant', content: 'Q3?' },
            { role: 'visitor', content: 'A3' },
          ]),
        ) // ensureAiFields messages
        .mockImplementationOnce(() => makeChain([{ systemPrompt: 'Gather CRM context.' }])) // finalize prompt
        .mockImplementationOnce(() => makeChain([createdRow])) // transition load
        .mockImplementationOnce(() => makeChain([readyRow])); // transition reload

      db.insert.mockImplementationOnce(() => makeChain([createdRow])); // inquiry
      // message inserts inside txn — return empty chains
      db.insert.mockImplementation(() => makeChain([{ id: 'm' }]));
      db.update.mockImplementation(() => makeChain([]));

      const result = await svc2.submitAdaptiveIntake({
        formId: 'form-1',
        opening: 'Need a CRM for our small sales team.',
        questions: ['Q1?', 'Q2?', 'Q3?'],
        answers: ['A1', 'A2', 'A3'],
        email: 'ada@example.com',
        contactName: 'Ada',
        locale: 'en',
      });

      expect(db.transaction).toHaveBeenCalled();
      expect(result.status).toBe('ready_for_review');
      expect(events.emit).toHaveBeenCalledWith('inquiry.created', { id: 'inq-1' });
      expect(events.emit).toHaveBeenCalledWith('inquiry.ready_for_review', { id: 'inq-1' });
      await mod2.close();
    });
  });

  // ── draftSystemPrompt / previewChat (ADR-0054) ─────────────────────────────

  describe('draftSystemPrompt', () => {
    it('throws when the form is missing', async () => {
      db.select.mockImplementationOnce(() => makeChain([]));
      await expect(service.draftSystemPrompt('missing', 'Collect demos')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('throws when the assistant is not bound', async () => {
      db.select.mockImplementationOnce(() =>
        makeChain([{ id: 'form-1', destination: 'inquiry', intakeMode: 'adaptive' }]),
      );
      await expect(service.draftSystemPrompt('form-1', 'Collect demos')).rejects.toMatchObject({
        status: 503,
      });
    });

    it('delegates to the assistant when bound', async () => {
      const mockAssistant = {
        process: jest.fn(),
        draftSystemPrompt: jest.fn().mockResolvedValue({
          systemPrompt: 'Ask about company size first.',
          openingLabels: {
            en: 'What is your company size?',
            pl: 'Jaka jest wielkość Twojej firmy?',
          },
        }),
        finalize: jest.fn(),
      };
      const mockModuleRef = {
        get: jest.fn().mockReturnValue(mockAssistant),
        container: {
          getModules: jest.fn().mockReturnValue(
            new Map([
              [
                'ai',
                {
                  hasProvider: () => true,
                  getProviderByKey: () => ({ instance: mockAssistant }),
                },
              ],
            ]),
          ),
        },
      };
      const mod = await Test.createTestingModule({
        providers: [
          InquiryService,
          { provide: DB_TOKEN, useValue: db },
          { provide: ContactsService, useValue: contacts },
          { provide: LeadsService, useValue: leads },
          { provide: EventsService, useValue: events },
          { provide: PluginRegistryService, useValue: plugins },
          { provide: ModuleRef, useValue: mockModuleRef },
        ],
      }).compile();
      const svc = mod.get(InquiryService);

      db.select.mockImplementationOnce(() =>
        makeChain([{ id: 'form-1', destination: 'inquiry', intakeMode: 'adaptive' }]),
      );

      const result = await svc.draftSystemPrompt('form-1', 'We book product demos.');
      expect(result.systemPrompt).toBe('Ask about company size first.');
      expect(result.openingLabels).toEqual({
        en: 'What is your company size?',
        pl: 'Jaka jest wielkość Twojej firmy?',
      });
      expect(mockAssistant.draftSystemPrompt).toHaveBeenCalledWith({
        brief: 'We book product demos.',
        locale: undefined,
      });
      await mod.close();
    });
  });

  describe('previewChat', () => {
    it('rejects non-adaptive forms', async () => {
      db.select.mockImplementationOnce(() =>
        makeChain([
          {
            id: 'form-1',
            destination: 'inquiry',
            intakeMode: 'static',
            systemPrompt: 'x',
          },
        ]),
      );
      await expect(
        service.previewChat('form-1', { messages: [], content: 'Hi' }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('rejects when system prompt is empty', async () => {
      db.select.mockImplementationOnce(() =>
        makeChain([
          {
            id: 'form-1',
            destination: 'inquiry',
            intakeMode: 'adaptive',
            systemPrompt: '  ',
          },
        ]),
      );
      await expect(
        service.previewChat('form-1', { messages: [], content: 'Hi' }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('returns assistant reply without writing inquiries', async () => {
      const mockAssistant = {
        process: jest.fn().mockResolvedValue({
          readyForReview: false,
          nextQuestion: 'How large is your team?',
          briefPatch: {},
          summary: null,
          proposedType: null,
          tags: [],
          missingInformation: [],
          evidence: {},
          inferences: {},
        }),
        draftSystemPrompt: jest.fn(),
        finalize: jest.fn(),
      };
      const mockModuleRef = {
        get: jest.fn().mockReturnValue(mockAssistant),
        container: {
          getModules: jest.fn().mockReturnValue(
            new Map([
              [
                'ai',
                {
                  hasProvider: () => true,
                  getProviderByKey: () => ({ instance: mockAssistant }),
                },
              ],
            ]),
          ),
        },
      };
      const mod = await Test.createTestingModule({
        providers: [
          InquiryService,
          { provide: DB_TOKEN, useValue: db },
          { provide: ContactsService, useValue: contacts },
          { provide: LeadsService, useValue: leads },
          { provide: EventsService, useValue: events },
          { provide: PluginRegistryService, useValue: plugins },
          { provide: ModuleRef, useValue: mockModuleRef },
        ],
      }).compile();
      const svc = mod.get(InquiryService);

      db.select.mockImplementationOnce(() =>
        makeChain([
          {
            id: 'form-1',
            destination: 'inquiry',
            intakeMode: 'adaptive',
            systemPrompt: 'Qualify demos.',
          },
        ]),
      );

      const result = await svc.previewChat('form-1', {
        messages: [],
        content: 'Hello',
      });

      expect(result.nextQuestion).toBe('How large is your team?');
      expect(db.insert).not.toHaveBeenCalled();
      expect(mockAssistant.process).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: 'Qualify demos.',
          latestVisitorMessage: 'Hello',
        }),
      );
      await mod.close();
    });
  });
});
