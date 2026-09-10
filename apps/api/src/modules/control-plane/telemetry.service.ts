import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import { plugins } from '../../core/database/schema';
import { ControlPlaneClient } from './control-plane.client';
import type { HeartbeatPayload } from './contracts';
import { InstallationIdentityService } from './installation-identity.service';

const DAY_MS = 24 * 60 * 60 * 1000;

function isTruthyEnv(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function isProduction(config: ConfigService): boolean {
  return (config.get<string>('NODE_ENV') ?? '').trim() === 'production';
}

function num(row: Record<string, unknown> | undefined, key: string): number {
  const v = row?.[key];
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : 0;
  return Number.isFinite(n) ? n : 0;
}

function firstRow(result: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(result)) return result[0] as Record<string, unknown> | undefined;
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows: unknown }).rows;
    if (Array.isArray(rows)) return rows[0] as Record<string, unknown> | undefined;
  }
  return undefined;
}

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly config: ConfigService,
    private readonly client: ControlPlaneClient,
    private readonly identity: InstallationIdentityService,
  ) {}

  telemetryDisabled(): boolean {
    return isTruthyEnv(this.config.get<string>('DISABLE_TELEMETRY'));
  }

  /** Non-production: send on every process run (no 24h gate). */
  isDevCadence(): boolean {
    return !isProduction(this.config);
  }

  /**
   * Send an anonymous heartbeat. Soft-fails on every error path — never throws
   * to the scheduler or HTTP callers that trigger a sync.
   */
  async sendHeartbeat(opts: { force?: boolean } = {}): Promise<boolean> {
    if (this.telemetryDisabled()) {
      this.logger.debug('Telemetry disabled (DISABLE_TELEMETRY); skipping heartbeat');
      return false;
    }

    try {
      const row = await this.identity.getOrCreate();
      const force = opts.force === true || this.isDevCadence();

      if (!force && row.lastHeartbeatAt) {
        const age = Date.now() - new Date(row.lastHeartbeatAt).getTime();
        if (age < DAY_MS) {
          this.logger.debug('Heartbeat already sent within 24h; skipping');
          return false;
        }
      }

      const payload = await this.buildPayload(row.installationId);
      const result = await this.client.heartbeat(payload);
      if (!result) {
        this.logger.warn('Control Plane heartbeat soft-failed (not configured or unreachable)');
        return false;
      }

      await this.identity.touchHeartbeat();
      return true;
    } catch (err) {
      this.logger.warn(`Heartbeat failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  async buildPayload(installationId: string): Promise<HeartbeatPayload> {
    const version = (this.config.get<string>('APP_VERSION') ?? 'dev').trim() || 'dev';

    const [counts, pluginRows] = await Promise.all([
      this.queryCounts(),
      this.db
        .select({
          name: plugins.name,
          version: plugins.version,
          enabled: plugins.enabled,
        })
        .from(plugins),
    ]);

    const googleMail = Boolean(
      this.config.get<string>('GOOGLE_MAIL_CLIENT_ID')?.trim() &&
      this.config.get<string>('GOOGLE_MAIL_CLIENT_SECRET')?.trim(),
    );

    const features: Record<string, boolean> = {
      boards: true,
      leads: true,
      forms: true,
      agent: true,
      mail: counts.mailboxesEnabled > 0,
      mailGoogleOauth: googleMail || counts.mailboxesGoogleOauth > 0,
      customFields: counts.customFields > 0,
    };
    for (const p of pluginRows) {
      if (p.enabled) features[p.name] = true;
    }

    return {
      installationId,
      product: 'khirby',
      version: version.slice(0, 64),
      sentAt: new Date().toISOString(),
      users: {
        total: counts.users,
        active7d: counts.active7d,
        active30d: counts.active30d,
      },
      usage: {
        contacts: counts.contacts,
        contacts7d: counts.contacts7d,
        contacts30d: counts.contacts30d,
        submissions: counts.submissions,
        submissions7d: counts.submissions7d,
        submissions30d: counts.submissions30d,
        forms: counts.forms,
        formsActive: counts.formsActive,
        leads: counts.leads,
        leads7d: counts.leads7d,
        leads30d: counts.leads30d,
        leadsWon: counts.leadsWon,
        leadsLost: counts.leadsLost,
        leadComments: counts.leadComments,
        pipelineStages: counts.pipelineStages,
        boardProjects: counts.boardProjects,
        boardModules: counts.boardModules,
        boardTasks: counts.boardTasks,
        boardTasks7d: counts.boardTasks7d,
        boardTasks30d: counts.boardTasks30d,
        boardTaskComments: counts.boardTaskComments,
        emails: counts.emails,
        emails7d: counts.emails7d,
        emails30d: counts.emails30d,
        emailsInbound: counts.emailsInbound,
        emailsOutbound: counts.emailsOutbound,
        emailThreads: counts.emailThreads,
        mailboxes: counts.mailboxes,
        mailboxesEnabled: counts.mailboxesEnabled,
        mailboxesConnected: counts.mailboxesConnected,
        mailboxesError: counts.mailboxesError,
        mailboxesGoogleOauth: counts.mailboxesGoogleOauth,
        agentConversations: counts.agentConversations,
        agentMessages: counts.agentMessages,
        agentAssistantMessages: counts.agentAssistantMessages,
        agentMessages7d: counts.agentMessages7d,
        agentMessages30d: counts.agentMessages30d,
        customFields: counts.customFields,
        newsletterLists: counts.newsletterLists,
        roles: counts.roles,
        pluginsInstalled: pluginRows.length,
        pluginsEnabled: pluginRows.filter((p) => p.enabled).length,
      },
      features,
      plugins: pluginRows.map((p) => ({ id: p.name, version: p.version })),
    };
  }

  private async queryCounts(): Promise<{
    users: number;
    active7d: number;
    active30d: number;
    contacts: number;
    contacts7d: number;
    contacts30d: number;
    submissions: number;
    submissions7d: number;
    submissions30d: number;
    forms: number;
    formsActive: number;
    leads: number;
    leads7d: number;
    leads30d: number;
    leadsWon: number;
    leadsLost: number;
    leadComments: number;
    pipelineStages: number;
    boardProjects: number;
    boardModules: number;
    boardTasks: number;
    boardTasks7d: number;
    boardTasks30d: number;
    boardTaskComments: number;
    emails: number;
    emails7d: number;
    emails30d: number;
    emailsInbound: number;
    emailsOutbound: number;
    emailThreads: number;
    mailboxes: number;
    mailboxesEnabled: number;
    mailboxesConnected: number;
    mailboxesError: number;
    mailboxesGoogleOauth: number;
    agentConversations: number;
    agentMessages: number;
    agentAssistantMessages: number;
    agentMessages7d: number;
    agentMessages30d: number;
    customFields: number;
    newsletterLists: number;
    roles: number;
  }> {
    const result = await this.db.execute(sql`
      select
        (select count(*)::int from users) as users,
        (select count(*)::int from contacts) as contacts,
        (select count(*)::int from contacts
          where created_at >= now() - interval '7 days') as contacts_7d,
        (select count(*)::int from contacts
          where created_at >= now() - interval '30 days') as contacts_30d,
        (select count(*)::int from submissions) as submissions,
        (select count(*)::int from submissions
          where created_at >= now() - interval '7 days') as submissions_7d,
        (select count(*)::int from submissions
          where created_at >= now() - interval '30 days') as submissions_30d,
        (select count(*)::int from forms) as forms,
        (select count(*)::int from forms where active = true) as forms_active,
        (select count(*)::int from leads) as leads,
        (select count(*)::int from leads
          where created_at >= now() - interval '7 days') as leads_7d,
        (select count(*)::int from leads
          where created_at >= now() - interval '30 days') as leads_30d,
        (select count(*)::int from leads l
          inner join pipeline_stages s on s.id = l.stage_id
          where s.is_won = true) as leads_won,
        (select count(*)::int from leads l
          inner join pipeline_stages s on s.id = l.stage_id
          where s.is_lost = true) as leads_lost,
        (select count(*)::int from lead_comments) as lead_comments,
        (select count(*)::int from pipeline_stages) as pipeline_stages,
        (select count(*)::int from tb_projects) as board_projects,
        (select count(*)::int from tb_modules) as board_modules,
        (select count(*)::int from tb_tasks) as board_tasks,
        (select count(*)::int from tb_tasks
          where created_at >= now() - interval '7 days') as board_tasks_7d,
        (select count(*)::int from tb_tasks
          where created_at >= now() - interval '30 days') as board_tasks_30d,
        (select count(*)::int from tb_task_comments) as board_task_comments,
        (select count(*)::int from email_messages) as emails,
        (select count(*)::int from email_messages
          where created_at >= now() - interval '7 days') as emails_7d,
        (select count(*)::int from email_messages
          where created_at >= now() - interval '30 days') as emails_30d,
        (select count(*)::int from email_messages
          where direction = 'inbound') as emails_inbound,
        (select count(*)::int from email_messages
          where direction = 'outbound') as emails_outbound,
        (select count(*)::int from email_threads) as email_threads,
        (select count(*)::int from mailboxes) as mailboxes,
        (select count(*)::int from mailboxes where enabled = true) as mailboxes_enabled,
        (select count(*)::int from mailboxes
          where connection_status = 'connected') as mailboxes_connected,
        (select count(*)::int from mailboxes
          where connection_status = 'error') as mailboxes_error,
        (select count(*)::int from mailboxes
          where auth_method = 'google_oauth') as mailboxes_google_oauth,
        (select count(*)::int from agent_conversations) as agent_conversations,
        (select count(*)::int from agent_messages) as agent_messages,
        (select count(*)::int from agent_messages
          where role = 'assistant') as agent_assistant_messages,
        (select count(*)::int from agent_messages
          where created_at >= now() - interval '7 days') as agent_messages_7d,
        (select count(*)::int from agent_messages
          where created_at >= now() - interval '30 days') as agent_messages_30d,
        (select count(*)::int from custom_field_definitions) as custom_fields,
        (select count(*)::int from newsletter_lists) as newsletter_lists,
        (select count(*)::int from roles) as roles,
        (select count(distinct uid)::int from (
          select c.user_id as uid
            from agent_messages m
            inner join agent_conversations c on c.id = m.conversation_id
            where m.created_at >= now() - interval '7 days'
          union
          select sent_by_user_id
            from email_messages
            where sent_by_user_id is not null
              and created_at >= now() - interval '7 days'
          union
          select user_id
            from tb_task_activity
            where user_id is not null
              and created_at >= now() - interval '7 days'
          union
          select created_by
            from tb_tasks
            where created_by is not null
              and updated_at >= now() - interval '7 days'
          union
          select owner_id
            from leads
            where owner_id is not null
              and updated_at >= now() - interval '7 days'
        ) active_7d) as active_7d,
        (select count(distinct uid)::int from (
          select c.user_id as uid
            from agent_messages m
            inner join agent_conversations c on c.id = m.conversation_id
            where m.created_at >= now() - interval '30 days'
          union
          select sent_by_user_id
            from email_messages
            where sent_by_user_id is not null
              and created_at >= now() - interval '30 days'
          union
          select user_id
            from tb_task_activity
            where user_id is not null
              and created_at >= now() - interval '30 days'
          union
          select created_by
            from tb_tasks
            where created_by is not null
              and updated_at >= now() - interval '30 days'
          union
          select owner_id
            from leads
            where owner_id is not null
              and updated_at >= now() - interval '30 days'
        ) active_30d) as active_30d
    `);
    const row = firstRow(result);
    return {
      users: num(row, 'users'),
      active7d: num(row, 'active_7d'),
      active30d: num(row, 'active_30d'),
      contacts: num(row, 'contacts'),
      contacts7d: num(row, 'contacts_7d'),
      contacts30d: num(row, 'contacts_30d'),
      submissions: num(row, 'submissions'),
      submissions7d: num(row, 'submissions_7d'),
      submissions30d: num(row, 'submissions_30d'),
      forms: num(row, 'forms'),
      formsActive: num(row, 'forms_active'),
      leads: num(row, 'leads'),
      leads7d: num(row, 'leads_7d'),
      leads30d: num(row, 'leads_30d'),
      leadsWon: num(row, 'leads_won'),
      leadsLost: num(row, 'leads_lost'),
      leadComments: num(row, 'lead_comments'),
      pipelineStages: num(row, 'pipeline_stages'),
      boardProjects: num(row, 'board_projects'),
      boardModules: num(row, 'board_modules'),
      boardTasks: num(row, 'board_tasks'),
      boardTasks7d: num(row, 'board_tasks_7d'),
      boardTasks30d: num(row, 'board_tasks_30d'),
      boardTaskComments: num(row, 'board_task_comments'),
      emails: num(row, 'emails'),
      emails7d: num(row, 'emails_7d'),
      emails30d: num(row, 'emails_30d'),
      emailsInbound: num(row, 'emails_inbound'),
      emailsOutbound: num(row, 'emails_outbound'),
      emailThreads: num(row, 'email_threads'),
      mailboxes: num(row, 'mailboxes'),
      mailboxesEnabled: num(row, 'mailboxes_enabled'),
      mailboxesConnected: num(row, 'mailboxes_connected'),
      mailboxesError: num(row, 'mailboxes_error'),
      mailboxesGoogleOauth: num(row, 'mailboxes_google_oauth'),
      agentConversations: num(row, 'agent_conversations'),
      agentMessages: num(row, 'agent_messages'),
      agentAssistantMessages: num(row, 'agent_assistant_messages'),
      agentMessages7d: num(row, 'agent_messages_7d'),
      agentMessages30d: num(row, 'agent_messages_30d'),
      customFields: num(row, 'custom_fields'),
      newsletterLists: num(row, 'newsletter_lists'),
      roles: num(row, 'roles'),
    };
  }
}

/** Exported for tests that assert the 24h gate without importing drizzle. */
export { DAY_MS as TELEMETRY_HEARTBEAT_MIN_INTERVAL_MS };
