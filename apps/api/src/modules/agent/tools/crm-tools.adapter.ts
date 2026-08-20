import { Injectable } from '@nestjs/common';
import { ContactsService } from '../../contacts/contacts.service';
import { LeadsService } from '../../leads/leads.service';
import { PipelineStagesService } from '../../leads/pipeline-stages.service';
import { ProjectsService } from '../../boards/projects/projects.service';
import { ModulesService } from '../../boards/modules/modules.service';
import { TasksService } from '../../boards/tasks/tasks.service';
import { RbacService } from '../../../core/rbac/rbac.service';
import type { LlmToolDef } from '../agent-llm.client';

export type ToolRunResult =
  { ok: true; summary: string } | { ok: false; code: string; summary: string };

@Injectable()
export class CrmToolsAdapter {
  constructor(
    private contacts: ContactsService,
    private leads: LeadsService,
    private stages: PipelineStagesService,
    private projects: ProjectsService,
    private modules: ModulesService,
    private tasks: TasksService,
    private rbac: RbacService,
  ) {}

  definitions(): LlmToolDef[] {
    return [
      tool(
        'search_contacts',
        'Search contacts; returns id, email, name, and phone for each match',
        {
          type: 'object',
          properties: { query: { type: 'string' }, page: { type: 'number' } },
          required: ['query'],
        },
      ),
      tool('get_contact', 'Get one contact by UUID (from search_contacts)', {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      }),
      tool('create_contact', 'Create a contact', {
        type: 'object',
        properties: {
          email: { type: 'string' },
          name: { type: 'string' },
          phone: { type: 'string' },
        },
        required: ['email'],
      }),
      tool(
        'search_leads',
        'List pipeline leads with id, stage, title, value, priority, and contact',
        {
          type: 'object',
          properties: { ownerId: { type: 'string', description: 'Optional owner user id filter' } },
        },
      ),
      tool('get_lead', 'Get one lead by UUID (from search_leads)', {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      }),
      tool('create_lead', 'Create a lead from contact email', {
        type: 'object',
        properties: {
          email: { type: 'string' },
          title: { type: 'string' },
          stageId: { type: 'string' },
        },
        required: ['email'],
      }),
      tool('move_lead', 'Move lead to another stage (use list_pipeline_stages for stageId)', {
        type: 'object',
        properties: { id: { type: 'string' }, stageId: { type: 'string' } },
        required: ['id', 'stageId'],
      }),
      tool('list_pipeline_stages', 'List pipeline stages with id, name, and position', {
        type: 'object',
        properties: {},
      }),
      tool(
        'list_board_modules',
        'List work-board projects and modules with moduleId for create_task',
        {
          type: 'object',
          properties: {},
        },
      ),
      tool('create_task', 'Create a board task (use list_board_modules for moduleId)', {
        type: 'object',
        properties: {
          moduleId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['moduleId', 'title'],
      }),
    ];
  }

  async run(userId: string, name: string, args: Record<string, unknown>): Promise<ToolRunResult> {
    const permMap: Record<string, string> = {
      search_contacts: 'contacts',
      get_contact: 'contacts',
      create_contact: 'contacts',
      search_leads: 'leads',
      get_lead: 'leads',
      create_lead: 'leads',
      move_lead: 'leads',
      list_pipeline_stages: 'leads',
      list_board_modules: 'boards',
      create_task: 'boards',
    };
    const resource = permMap[name];
    if (!resource) return { ok: false, code: 'unknown_tool', summary: 'Unknown tool' };
    if (!(await this.rbac.hasPermission(userId, resource, 'manage'))) {
      return { ok: false, code: 'forbidden', summary: 'Forbidden' };
    }

    try {
      switch (name) {
        case 'search_contacts': {
          const data = await this.contacts.findAll({
            search: String(args.query ?? ''),
            page: Number(args.page ?? 1),
            pageSize: 10,
          });
          const rows = (data as { data?: ContactRow[]; total?: number }).data ?? [];
          const total = (data as { total?: number }).total ?? rows.length;
          if (!rows.length) {
            return { ok: true, summary: `No contacts found (total=${total}).` };
          }
          const lines = rows.map(formatContactLine);
          return {
            ok: true,
            summary: `${total} contact(s), showing ${lines.length}:\n${lines.join('\n')}`,
          };
        }
        case 'get_contact': {
          const id = String(args.id ?? '').trim();
          if (!id) return { ok: false, code: 'invalid_args', summary: 'Contact id is required' };
          const row = await this.contacts.findById(id);
          if (!row)
            return { ok: false, code: 'not_found', summary: `Contact not found for id=${id}` };
          return { ok: true, summary: formatContactDetail(row as ContactDetailRow) };
        }
        case 'create_contact': {
          const row = await this.contacts.create({
            email: String(args.email),
            name: args.name ? String(args.name) : undefined,
            phone: args.phone ? String(args.phone) : undefined,
          });
          return { ok: true, summary: `Created contact ${(row as any).id}` };
        }
        case 'search_leads': {
          const board = await this.leads.getBoard(args.ownerId ? String(args.ownerId) : undefined);
          const lines = flattenBoardLeads(board);
          if (!lines.length) {
            return { ok: true, summary: 'No leads on the pipeline board.' };
          }
          return { ok: true, summary: `${lines.length} lead(s):\n${lines.join('\n')}` };
        }
        case 'get_lead': {
          const id = String(args.id ?? '').trim();
          if (!id) return { ok: false, code: 'invalid_args', summary: 'Lead id is required' };
          const row = await this.leads.findById(id);
          if (!row) return { ok: false, code: 'not_found', summary: `Lead not found for id=${id}` };
          const stage = row.stageId ? await this.stages.findById(row.stageId) : null;
          return { ok: true, summary: formatLeadDetail(row, stage?.name ?? null) };
        }
        case 'create_lead': {
          const row = await this.leads.createManual({
            email: String(args.email),
            title: args.title ? String(args.title) : undefined,
            stageId: args.stageId ? String(args.stageId) : undefined,
          });
          const detail = await this.leads.findById((row as { id: string }).id);
          if (!detail) {
            return { ok: true, summary: `Created lead id=${(row as { id: string }).id}` };
          }
          const stage = detail.stageId ? await this.stages.findById(detail.stageId) : null;
          return {
            ok: true,
            summary: `Created | ${formatLeadDetail(detail, stage?.name ?? null)}`,
          };
        }
        case 'move_lead': {
          const id = String(args.id ?? '').trim();
          const stageId = String(args.stageId ?? '').trim();
          if (!id || !stageId) {
            return { ok: false, code: 'invalid_args', summary: 'Lead id and stageId are required' };
          }
          await this.leads.update(id, { stageId });
          const row = await this.leads.findById(id);
          const stage = await this.stages.findById(stageId);
          if (!row) {
            return {
              ok: true,
              summary: `Moved lead id=${id} to stage=${stage?.name ?? stageId}`,
            };
          }
          return {
            ok: true,
            summary: `Moved | ${formatLeadDetail(row, stage?.name ?? null)}`,
          };
        }
        case 'list_pipeline_stages': {
          const rows = await this.stages.findAll();
          if (!(rows as PipelineStageRow[]).length) {
            return { ok: true, summary: 'No pipeline stages configured.' };
          }
          const lines = (rows as PipelineStageRow[]).map(formatStageLine);
          return { ok: true, summary: `${lines.length} stage(s):\n${lines.join('\n')}` };
        }
        case 'list_board_modules': {
          const projectRows = await this.projects.findAll();
          if (!projectRows.length) {
            return { ok: true, summary: 'No work-board projects.' };
          }
          const lines: string[] = [];
          for (const project of projectRows) {
            const moduleRows = await this.modules.findByProject(project.id);
            if (!moduleRows.length) {
              lines.push(`- project=${project.name} | key=${project.key} | (no modules)`);
              continue;
            }
            for (const mod of moduleRows) {
              lines.push(
                `- project=${project.name} | key=${project.key} | moduleId=${mod.id} | module=${mod.name}`,
              );
            }
          }
          return { ok: true, summary: lines.join('\n') };
        }
        case 'create_task': {
          const row = await this.tasks.create(
            {
              moduleId: String(args.moduleId),
              title: String(args.title),
              description: args.description ? String(args.description) : undefined,
            },
            userId,
          );
          return { ok: true, summary: `Created task ${(row as any).id}` };
        }
        default:
          return { ok: false, code: 'unknown_tool', summary: 'Unknown tool' };
      }
    } catch {
      return { ok: false, code: 'tool_error', summary: 'Tool failed' };
    }
  }
}

function tool(name: string, description: string, parameters: Record<string, unknown>): LlmToolDef {
  return { type: 'function', function: { name, description, parameters } };
}

type ContactRow = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
};

type ContactDetailRow = ContactRow & {
  leads?: Array<{
    id: string;
    title: string | null;
    stageName: string | null;
    priority: string | null;
  }>;
  submissions?: unknown[];
};

type PipelineStageRow = {
  id: string;
  name: string;
  position: number;
  isWon?: boolean;
  isLost?: boolean;
};

function formatContactLine(contact: ContactRow): string {
  const parts = [
    `id=${contact.id}`,
    `email=${contact.email}`,
    `name=${contact.name?.trim() || '—'}`,
  ];
  if (contact.phone?.trim()) parts.push(`phone=${contact.phone.trim()}`);
  return `- ${parts.join(' | ')}`;
}

function formatContactDetail(row: ContactDetailRow): string {
  const parts = [`id=${row.id}`, `email=${row.email}`, `name=${row.name?.trim() || '—'}`];
  if (row.phone?.trim()) parts.push(`phone=${row.phone.trim()}`);
  const leadCount = row.leads?.length ?? 0;
  if (leadCount) parts.push(`leads=${leadCount}`);
  for (const lead of row.leads?.slice(0, 5) ?? []) {
    parts.push(
      `lead[id=${lead.id},stage=${lead.stageName ?? '?'},title=${lead.title?.trim() || 'Untitled'}]`,
    );
  }
  const submissionCount = row.submissions?.length ?? 0;
  if (submissionCount) parts.push(`submissions=${submissionCount}`);
  return parts.join(' | ');
}

function formatStageLine(stage: PipelineStageRow): string {
  const flags: string[] = [];
  if (stage.isWon) flags.push('won');
  if (stage.isLost) flags.push('lost');
  const suffix = flags.length ? ` | ${flags.join(',')}` : '';
  return `- id=${stage.id} | name=${stage.name} | position=${stage.position}${suffix}`;
}

type BoardLead = {
  id: string;
  title: string | null;
  value: string | null;
  priority: string | null;
  formName: string | null;
  contactEmail: string | null;
  contactName: string | null;
  ownerEmail: string | null;
  hasNewMail?: boolean;
};

function flattenBoardLeads(board: unknown): string[] {
  const columns = (board as { columns?: Array<{ stage?: { name?: string }; leads?: BoardLead[] }> })
    ?.columns;
  if (!columns?.length) return [];

  const lines: string[] = [];
  for (const col of columns) {
    const stageName = col.stage?.name ?? 'Unknown stage';
    for (const lead of col.leads ?? []) {
      lines.push(formatLeadLine(lead, stageName));
    }
  }
  return lines;
}

function formatLeadLine(lead: BoardLead, stageName: string): string {
  const parts = [
    `id=${lead.id}`,
    `stage=${stageName}`,
    `title=${lead.title?.trim() || 'Untitled'}`,
  ];
  if (lead.value) parts.push(`value=${lead.value}`);
  if (lead.priority) parts.push(`priority=${lead.priority}`);
  if (lead.contactName) parts.push(`contact=${lead.contactName}`);
  if (lead.contactEmail) parts.push(`email=${lead.contactEmail}`);
  if (lead.ownerEmail) parts.push(`owner=${lead.ownerEmail}`);
  if (lead.formName) parts.push(`form=${lead.formName}`);
  if (lead.hasNewMail) parts.push('newMail=yes');
  return `- ${parts.join(' | ')}`;
}

function formatLeadDetail(
  row: {
    id: string;
    title: string | null;
    value: string | null;
    priority: string | null;
    formName: string | null;
    contactEmail: string | null;
    contactName: string | null;
    ownerEmail: string | null;
    hasNewMail?: boolean;
    lastMailAt?: string | null;
    comments?: Array<{ body: string; userEmail: string | null }>;
  },
  stageName: string | null,
): string {
  const parts = [
    `id=${row.id}`,
    `stage=${stageName ?? 'Unknown'}`,
    `title=${row.title?.trim() || 'Untitled'}`,
  ];
  if (row.value) parts.push(`value=${row.value}`);
  if (row.priority) parts.push(`priority=${row.priority}`);
  if (row.contactName) parts.push(`contact=${row.contactName}`);
  if (row.contactEmail) parts.push(`email=${row.contactEmail}`);
  if (row.ownerEmail) parts.push(`owner=${row.ownerEmail}`);
  if (row.formName) parts.push(`form=${row.formName}`);
  if (row.hasNewMail) parts.push('newMail=yes');
  if (row.lastMailAt) parts.push(`lastMailAt=${row.lastMailAt}`);
  const commentCount = row.comments?.length ?? 0;
  if (commentCount) parts.push(`comments=${commentCount}`);
  return parts.join(' | ');
}
