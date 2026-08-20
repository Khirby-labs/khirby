import { Test } from '@nestjs/testing';
import { CrmToolsAdapter } from './crm-tools.adapter';
import { ContactsService } from '../../contacts/contacts.service';
import { LeadsService } from '../../leads/leads.service';
import { PipelineStagesService } from '../../leads/pipeline-stages.service';
import { TasksService } from '../../boards/tasks/tasks.service';
import { ProjectsService } from '../../boards/projects/projects.service';
import { ModulesService } from '../../boards/modules/modules.service';
import { RbacService } from '../../../core/rbac/rbac.service';

describe('CrmToolsAdapter', () => {
  let adapter: CrmToolsAdapter;
  let rbac: jest.Mocked<Pick<RbacService, 'hasPermission'>>;
  let contacts: jest.Mocked<Pick<ContactsService, 'findAll' | 'findById' | 'create'>>;
  let leads: jest.Mocked<Pick<LeadsService, 'getBoard' | 'findById' | 'createManual' | 'update'>>;
  let stages: jest.Mocked<Pick<PipelineStagesService, 'findAll' | 'findById'>>;
  let projects: jest.Mocked<Pick<ProjectsService, 'findAll'>>;
  let modules: jest.Mocked<Pick<ModulesService, 'findByProject'>>;
  let tasks: jest.Mocked<Pick<TasksService, 'create'>>;

  beforeEach(async () => {
    rbac = { hasPermission: jest.fn().mockResolvedValue(true) };
    contacts = {
      findAll: jest.fn().mockResolvedValue({
        total: 2,
        data: [
          { id: 'c1', email: 'ann@acme.com', name: 'Ann', phone: '+48111222333' },
          { id: 'c2', email: 'bob@acme.com', name: 'Bob', phone: null },
        ],
      }),
      findById: jest.fn().mockResolvedValue({
        id: 'c1',
        email: 'a@b.com',
        name: 'Ann',
        phone: null,
        leads: [{ id: 'l9', title: 'Deal', stageName: 'Won', priority: 'high' }],
        submissions: [],
      }),
      create: jest.fn().mockResolvedValue({ id: 'c2' }),
    };
    leads = {
      getBoard: jest.fn().mockResolvedValue({ columns: [{ leads: [{ id: 'l1' }] }] }),
      findById: jest.fn().mockResolvedValue({ id: 'l1', title: 'Deal' }),
      createManual: jest.fn().mockResolvedValue({ id: 'l2' }),
      update: jest.fn().mockResolvedValue({ id: 'l1' }),
    };
    stages = {
      findAll: jest.fn().mockResolvedValue([
        { id: 's1', name: 'New', position: 0 },
        { id: 's2', name: 'Won', position: 1, isWon: true },
      ]),
      findById: jest.fn().mockResolvedValue(null),
    };
    projects = {
      findAll: jest.fn().mockResolvedValue([{ id: 'p1', name: 'Product', key: 'PROD' }]),
    };
    modules = {
      findByProject: jest
        .fn()
        .mockResolvedValue([{ id: 'm1', name: 'Sprint board', projectId: 'p1' }]),
    };
    tasks = { create: jest.fn().mockResolvedValue({ id: 't1' }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CrmToolsAdapter,
        { provide: ContactsService, useValue: contacts },
        { provide: LeadsService, useValue: leads },
        { provide: PipelineStagesService, useValue: stages },
        { provide: ProjectsService, useValue: projects },
        { provide: ModulesService, useValue: modules },
        { provide: TasksService, useValue: tasks },
        { provide: RbacService, useValue: rbac },
      ],
    }).compile();

    adapter = moduleRef.get(CrmToolsAdapter);
  });

  it('exposes CRM tool definitions', () => {
    const names = adapter.definitions().map((d) => d.function.name);
    expect(names).toContain('search_contacts');
    expect(names).toContain('create_task');
  });

  it('returns forbidden when RBAC denies', async () => {
    rbac.hasPermission.mockResolvedValue(false);
    const result = await adapter.run('user-1', 'search_contacts', { query: 'x' });
    expect(result).toEqual({ ok: false, code: 'forbidden', summary: 'Forbidden' });
  });

  it('returns unknown_tool for unsupported names', async () => {
    const result = await adapter.run('user-1', 'nope', {});
    expect(result).toEqual({ ok: false, code: 'unknown_tool', summary: 'Unknown tool' });
  });

  it('runs search_contacts with ids and details', async () => {
    const result = await adapter.run('user-1', 'search_contacts', { query: 'ann' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toContain('c1');
      expect(result.summary).toContain('ann@acme.com');
      expect(result.summary).toContain('Ann');
    }
    expect(contacts.findAll).toHaveBeenCalledWith({ search: 'ann', page: 1, pageSize: 10 });
  });

  it('runs get_contact with lead summary', async () => {
    const result = await adapter.run('user-1', 'get_contact', { id: 'c1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toContain('id=c1');
      expect(result.summary).toContain('a@b.com');
      expect(result.summary).toContain('lead[id=l9');
    }
  });

  it('runs list_pipeline_stages with ids', async () => {
    const result = await adapter.run('user-1', 'list_pipeline_stages', {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toContain('id=s1');
      expect(result.summary).toContain('name=New');
      expect(result.summary).toContain('id=s2');
    }
  });

  it('runs list_board_modules with moduleId', async () => {
    const result = await adapter.run('user-1', 'list_board_modules', {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toContain('moduleId=m1');
      expect(result.summary).toContain('Product');
    }
  });

  it('runs search_leads with ids and stage details', async () => {
    leads.getBoard.mockResolvedValue({
      columns: [
        {
          stage: { name: 'Negotiation' },
          leads: [
            {
              id: 'lead-uuid-1',
              title: 'Acme',
              value: '5000',
              priority: 'high',
              formName: 'Contact',
              contactEmail: 'a@acme.com',
              contactName: 'Ann',
              ownerEmail: 'owner@crm.test',
              hasNewMail: false,
            },
          ],
        },
      ],
    } as any);

    const result = await adapter.run('user-1', 'search_leads', {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toContain('lead-uuid-1');
      expect(result.summary).toContain('Negotiation');
      expect(result.summary).toContain('Acme');
      expect(result.summary).toContain('a@acme.com');
    }
  });

  it('runs get_lead with stage and contact details', async () => {
    leads.findById.mockResolvedValue({
      id: 'lead-uuid-1',
      title: 'Acme',
      value: '5000',
      priority: 'high',
      stageId: 'stage-1',
      formName: null,
      contactEmail: 'a@acme.com',
      contactName: 'Ann',
      ownerEmail: null,
      hasNewMail: false,
      comments: [],
    } as any);
    stages.findById.mockResolvedValue({ id: 'stage-1', name: 'Won' } as any);

    const result = await adapter.run('user-1', 'get_lead', { id: 'lead-uuid-1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toContain('lead-uuid-1');
      expect(result.summary).toContain('stage=Won');
      expect(result.summary).toContain('a@acme.com');
    }
  });

  it('runs create_task with user id', async () => {
    const result = await adapter.run('user-1', 'create_task', {
      moduleId: 'mod-1',
      title: 'Follow up',
    });
    expect(result).toEqual({ ok: true, summary: 'Created task t1' });
    expect(tasks.create).toHaveBeenCalledWith(
      { moduleId: 'mod-1', title: 'Follow up', description: undefined },
      'user-1',
    );
  });

  it('maps service failures to tool_error', async () => {
    contacts.findAll.mockRejectedValue(new Error('db down'));
    const result = await adapter.run('user-1', 'search_contacts', { query: 'x' });
    expect(result).toEqual({ ok: false, code: 'tool_error', summary: 'Tool failed' });
  });
});
