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
      tool(
        'create_contact',
        'Create a contact. Optional custom is slug → value (list_custom_fields first).',
        {
          type: 'object',
          properties: {
            email: { type: 'string' },
            name: { type: 'string' },
            phone: { type: 'string' },
            custom: {
              type: 'object',
              description: 'Custom field slug → value',
              additionalProperties: true,
            },
          },
          required: ['email'],
        },
      ),
      tool(
        'update_contact',
        'Update a contact by UUID from search_contacts. custom merges via jsonb_set (does not replace interests/listmonk).',
        {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            name: { type: 'string' },
            phone: { type: 'string' },
            custom: {
              type: 'object',
              description: 'Custom field slug → value',
              additionalProperties: true,
            },
          },
          required: ['id'],
        },
      ),
      tool(
        'list_custom_fields',
        'List contact custom field definitions (slug, type, select options). Call before setting custom or mapping an import.',
        {
          type: 'object',
          properties: {},
        },
      ),
      tool(
        'import_contacts',
        'Import contacts from mapped rows (max 1000). mapping is CRM field (email/name/phone/custom slug) → column name in each row. Duplicate emails are skipped.',
        {
          type: 'object',
          properties: {
            mapping: {
              type: 'object',
              description: 'CRM field → row column name. email is required.',
              additionalProperties: { type: 'string' },
            },
            rows: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
          },
          required: ['mapping', 'rows'],
        },
      ),
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
      update_contact: 'contacts',
      list_custom_fields: 'contacts',
      import_contacts: 'contacts',
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
          const custom = asStringRecord(args.custom);
          const row = await this.contacts.create({
            email: String(args.email),
            name: args.name ? String(args.name) : undefined,
            phone: args.phone ? String(args.phone) : undefined,
            custom: custom ?? undefined,
          });
          return { ok: true, summary: `Created contact ${(row as { id?: string }).id}` };
        }
        case 'update_contact': {
          const id = String(args.id ?? '').trim();
          if (!id) return { ok: false, code: 'invalid_args', summary: 'Contact id is required' };
          const custom = asStringRecord(args.custom);
          const row = await this.contacts.update(id, {
            email: args.email ? String(args.email) : undefined,
            name: args.name ? String(args.name) : undefined,
            phone: args.phone !== undefined ? String(args.phone) : undefined,
            custom: custom ?? undefined,
          });
          return { ok: true, summary: formatContactDetail(row as ContactDetailRow) };
        }
        case 'list_custom_fields': {
          const rows = (await this.contacts.listCustomFields()) as CustomFieldRow[];
          if (!rows.length) return { ok: true, summary: 'No custom fields defined.' };
          const lines = rows.map(formatCustomFieldLine);
          return { ok: true, summary: `${lines.length} custom field(s):\n${lines.join('\n')}` };
        }
        case 'import_contacts': {
          const mapping = asStringMap(args.mapping);
          const rows = asRowList(args.rows);
          if (!mapping || !mapping.email) {
            return {
              ok: false,
              code: 'invalid_args',
              summary: 'mapping.email (CRM email → column name) is required',
            };
          }
          if (!rows) {
            return { ok: false, code: 'invalid_args', summary: 'rows must be an array of objects' };
          }
          const result = await this.contacts.importRows({ mapping, rows });
          const errBit = result.errors.length
            ? `; ${result.errors.length} error(s): ${result.errors
                .slice(0, 8)
                .map((e) => `row ${e.row}=${e.reason}`)
                .join(', ')}`
            : '';
          return {
            ok: true,
            summary: `Imported ${result.imported}, skipped ${result.skipped}${errBit}`,
          };
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
  metadata?: { custom?: Record<string, unknown> } | null;
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

type CustomFieldRow = {
  name: string;
  slug: string;
  type: string;
  options?: string[] | null;
};

function formatCustomFieldLine(field: CustomFieldRow): string {
  const opts = field.options?.length ? ` | options=${field.options.join(',')}` : '';
  return `- slug=${field.slug} | name=${field.name} | type=${field.type}${opts}`;
}

function formatCustomBag(metadata: ContactRow['metadata']): string | null {
  const custom = metadata?.custom;
  if (!custom || typeof custom !== 'object') return null;
  const parts = Object.entries(custom)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${String(v)}`);
  return parts.length ? `custom=${parts.join(',')}` : null;
}

function asStringRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asStringMap(value: unknown): Record<string, string> | null {
  const rec = asStringRecord(value);
  if (!rec) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (v == null || v === '') continue;
    out[k] = String(v);
  }
  return out;
}

function asRowList(value: unknown): Record<string, unknown>[] | null {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value)) return null;
  return value.filter(
    (row): row is Record<string, unknown> =>
      !!row && typeof row === 'object' && !Array.isArray(row),
  );
}

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
  const custom = formatCustomBag(contact.metadata);
  if (custom) parts.push(custom);
  return `- ${parts.join(' | ')}`;
}

function formatContactDetail(row: ContactDetailRow): string {
  const parts = [`id=${row.id}`, `email=${row.email}`, `name=${row.name?.trim() || '—'}`];
  if (row.phone?.trim()) parts.push(`phone=${row.phone.trim()}`);
  const custom = formatCustomBag(row.metadata);
  if (custom) parts.push(custom);
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
