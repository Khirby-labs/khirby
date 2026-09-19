import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { PipelineStagesService } from './pipeline-stages.service';
import { ContactsService } from '../contacts/contacts.service';
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

describe('LeadsService', () => {
  let service: LeadsService;
  let module: TestingModule;
  let db: ReturnType<typeof buildDb>;
  let stages: jest.Mocked<
    Pick<PipelineStagesService, 'ensureDefaults' | 'getFirstStage' | 'findById'>
  >;
  let contacts: jest.Mocked<Pick<ContactsService, 'upsertByEmail'>>;
  let plugins: { emit: jest.Mock };

  beforeEach(async () => {
    db = buildDb();
    stages = {
      ensureDefaults: jest.fn().mockResolvedValue(undefined),
      getFirstStage: jest.fn().mockResolvedValue({ id: 'stage-1', name: 'New Lead', position: 0 }),
      findById: jest.fn().mockResolvedValue({ id: 'stage-1', name: 'New Lead' }),
    };
    contacts = {
      upsertByEmail: jest.fn().mockResolvedValue({ id: 'c1', email: 'a@b.com', name: 'Alice' }),
    };
    plugins = { emit: jest.fn() };

    module = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: DB_TOKEN, useValue: db },
        { provide: PipelineStagesService, useValue: stages },
        { provide: ContactsService, useValue: contacts },
        { provide: EventsService, useValue: { emit: jest.fn() } },
        { provide: PluginRegistryService, useValue: plugins },
      ],
    }).compile();

    service = module.get(LeadsService);
  });

  afterEach(async () => {
    await module?.close();
  });

  describe('createFromSubmission', () => {
    it('creates lead in first stage with extracted value', async () => {
      const leadRow = {
        id: 'l1',
        contactId: 'c1',
        submissionId: 's1',
        stageId: 'stage-1',
        ownerId: null,
        title: 'Alice',
        value: '5000',
        priority: 'medium',
        formName: 'Contact Form',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      };
      db.insert.mockImplementationOnce(() => makeChain([leadRow]));

      const result = await service.createFromSubmission({
        contactId: 'c1',
        submissionId: 's1',
        submissionData: { email: 'a@b.com', amount: '5000' },
        formName: 'Contact Form',
        contactName: 'Alice',
        contactEmail: 'a@b.com',
      });

      expect(stages.ensureDefaults).toHaveBeenCalled();
      expect(stages.getFirstStage).toHaveBeenCalled();
      expect(result.id).toBe('l1');
      expect(result.value).toBe('5000');
      expect(plugins.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'lead.created',
          payload: expect.objectContaining({
            id: 'l1',
            email: 'a@b.com',
            stageName: 'New Lead',
            title: 'Alice',
          }),
        }),
      );
    });
  });

  describe('update', () => {
    it('throws when lead not found', async () => {
      db.select.mockImplementationOnce(() => makeChain([]));

      await expect(service.update('missing', { title: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('deletes an existing lead', async () => {
      const leadRow = {
        id: 'l1',
        contactId: 'c1',
        submissionId: null,
        stageId: 'stage-1',
        ownerId: null,
        title: 'Alice',
        value: null,
        priority: 'medium',
        formName: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        contactEmail: 'a@b.com',
        contactName: 'Alice',
        ownerEmail: null,
      };
      // findById: lead select, then comments select
      db.select
        .mockImplementationOnce(() => makeChain([leadRow]))
        .mockImplementationOnce(() => makeChain([]));
      db.delete.mockImplementationOnce(() => makeChain([]));

      await expect(service.delete('l1')).resolves.toEqual({ deleted: true });
      expect(db.delete).toHaveBeenCalled();
    });

    it('throws when lead not found', async () => {
      db.select.mockImplementationOnce(() => makeChain([]));

      await expect(service.delete('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createFromInquiry', () => {
    it('creates lead in first stage from inquiry data', async () => {
      const leadRow = {
        id: 'l2',
        contactId: 'c1',
        submissionId: null,
        stageId: 'stage-1',
        ownerId: null,
        title: 'Alice · Acme',
        value: null,
        priority: 'medium',
        formName: 'Demo form',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      };
      db.insert
        .mockImplementationOnce(() => makeChain([leadRow]))
        .mockImplementationOnce(() => makeChain([{ id: 'cmt-1' }]));

      const result = await service.createFromInquiry({
        inquiryId: 'inq-1',
        contactId: 'c1',
        contactName: 'Alice',
        email: 'alice@example.com',
        companyName: 'Acme',
        formName: 'Demo form',
        aiSummary: 'Needs a CRM for sales.',
        proposedType: 'CRM',
        tags: ['crm'],
        brief: {
          problem: 'Excel chaos',
          desiredOutcome: null,
          currentProcess: null,
          currentTools: [],
          teamSize: 12,
          constraints: [],
          timeline: null,
          inquiryType: null,
        },
      });

      expect(result.id).toBe('l2');
      expect(result.title).toBe('Alice · Acme');
      expect(result.formName).toBe('Demo form');
      expect(db.insert).toHaveBeenCalledTimes(2);
      expect(stages.ensureDefaults).toHaveBeenCalled();
      expect(stages.getFirstStage).toHaveBeenCalled();
    });

    it('uses email as title when contactName is absent', async () => {
      const leadRow = {
        id: 'l3',
        contactId: 'c1',
        submissionId: null,
        stageId: 'stage-1',
        ownerId: null,
        title: 'alice@example.com',
        value: null,
        priority: 'medium',
        formName: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      };
      db.insert.mockImplementationOnce(() => makeChain([leadRow]));

      const result = await service.createFromInquiry({
        inquiryId: 'inq-1',
        contactId: 'c1',
        email: 'alice@example.com',
      });

      expect(result.title).toBe('alice@example.com');
    });

    it('uses provided stageId instead of first stage', async () => {
      stages.findById.mockResolvedValueOnce({ id: 'stage-2', name: 'Qualified' } as any);
      const leadRow = {
        id: 'l4',
        contactId: 'c1',
        submissionId: null,
        stageId: 'stage-2',
        ownerId: null,
        title: 'Alice',
        value: null,
        priority: 'medium',
        formName: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      };
      db.insert.mockImplementationOnce(() => makeChain([leadRow]));

      const result = await service.createFromInquiry({
        inquiryId: 'inq-1',
        contactId: 'c1',
        contactName: 'Alice',
        email: 'alice@example.com',
        stageId: 'stage-2',
      });

      expect(stages.findById).toHaveBeenCalledWith('stage-2');
      expect(result.stageId).toBe('stage-2');
    });
  });
});
