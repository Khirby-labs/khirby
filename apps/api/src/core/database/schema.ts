import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  boolean,
  numeric,
  integer,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const contacts = pgTable('contacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  phone: text('phone'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type FormKind = 'contact' | 'waitlist' | 'wishlist' | 'feedback';

export type SubmissionSource = {
  referer?: string;
  userAgent?: string;
  ip?: string;
};

export const submissions = pgTable('submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  contactId: uuid('contact_id')
    .references(() => contacts.id, { onDelete: 'cascade' })
    .notNull(),
  formId: uuid('form_id').references(() => forms.id, { onDelete: 'set null' }),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  source: jsonb('source').$type<SubmissionSource>().notNull().default({}),
  listmonkSynced: boolean('listmonk_synced').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const forms = pgTable('forms', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  kind: text('kind').$type<FormKind>().default('contact').notNull(),
  schema: jsonb('schema')
    .$type<
      Array<{
        name: string;
        label: string;
        labels?: { en?: string; pl?: string };
        type: string;
        required: boolean;
        options?: string[];
      }>
    >()
    .notNull()
    .default([]),
  endpointToken: uuid('endpoint_token').defaultRandom().notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  /**
   * Interface language, chosen in Settings. NULL means "no choice made" — the SPA
   * then follows the browser, which is also what /login has to do before a session
   * exists (ADR-0011). Validated against SUPPORTED_LOCALE_CODES on write, so an
   * unregistered value can never reach the column.
   */
  locale: text('locale'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
});

export const rolePermissions = pgTable('role_permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  roleId: uuid('role_id')
    .references(() => roles.id, { onDelete: 'cascade' })
    .notNull(),
  resource: text('resource').notNull(),
  action: text('action').notNull(),
});

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    roleId: uuid('role_id')
      .references(() => roles.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => ({
    // Composite PK makes (userId, roleId) unique so onConflictDoNothing actually
    // dedupes assignments — without it duplicate rows inflate RbacService joins.
    pk: primaryKey({ columns: [t.userId, t.roleId] }),
  }),
);

export const newsletterLists = pgTable('newsletter_lists', {
  id: uuid('id').defaultRandom().primaryKey(),
  listmonkListId: text('listmonk_list_id').notNull(),
  name: text('name').notNull(),
  syncedAt: timestamp('synced_at'),
});

// ─── Plugin registry ──────────────────────────────────────────────────────────

// ─── Sales pipeline ─────────────────────────────────────────────────────────

export type LeadPriority = 'low' | 'medium' | 'high';

export const pipelineStages = pgTable('pipeline_stages', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  position: integer('position').notNull(),
  isWon: boolean('is_won').default(false).notNull(),
  isLost: boolean('is_lost').default(false).notNull(),
});

export const leads = pgTable('leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  contactId: uuid('contact_id')
    .references(() => contacts.id, { onDelete: 'cascade' })
    .notNull(),
  submissionId: uuid('submission_id').references(() => submissions.id, { onDelete: 'set null' }),
  stageId: uuid('stage_id')
    .references(() => pipelineStages.id, { onDelete: 'restrict' })
    .notNull(),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  value: numeric('value'),
  priority: text('priority').$type<LeadPriority>().default('medium').notNull(),
  formName: text('form_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const leadComments = pgTable('lead_comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  leadId: uuid('lead_id')
    .references(() => leads.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Plugin registry ──────────────────────────────────────────────────────────

// ─── Core mail ───────────────────────────────────────────────────────────────

export type MailboxConnectionStatus = 'disconnected' | 'connected' | 'reconnecting' | 'error';
export type MailboxAuthMethod = 'password' | 'google_oauth';
export type EmailDirection = 'inbound' | 'outbound';
export type EmailStatus = 'pending' | 'sent' | 'failed';

export const mailboxes = pgTable('mailboxes', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  fromName: text('from_name').notNull(),
  fromAddress: text('from_address').notNull(),
  authMethod: text('auth_method').$type<MailboxAuthMethod>().default('password').notNull(),
  // IMAP
  imapHost: text('imap_host').notNull(),
  imapPort: integer('imap_port').notNull(),
  imapSecure: boolean('imap_secure').default(true).notNull(),
  imapUser: text('imap_user').notNull(),
  /** Required when authMethod=password; null for google_oauth. */
  imapPasswordEnc: text('imap_password_enc'),
  // SMTP
  smtpHost: text('smtp_host').notNull(),
  smtpPort: integer('smtp_port').notNull(),
  smtpSecure: boolean('smtp_secure').default(true).notNull(),
  smtpUser: text('smtp_user').notNull(),
  /** Required when authMethod=password; null for google_oauth. */
  smtpPasswordEnc: text('smtp_password_enc'),
  /** AES-GCM refresh token; set when authMethod=google_oauth. */
  oauthRefreshTokenEnc: text('oauth_refresh_token_enc'),
  oauthTokenExpiresAt: timestamp('oauth_token_expires_at'),
  // Config / sync state
  enabled: boolean('enabled').default(false).notNull(),
  backfillDays: integer('backfill_days').default(30).notNull(),
  connectionStatus: text('connection_status')
    .$type<MailboxConnectionStatus>()
    .default('disconnected')
    .notNull(),
  lastSyncAt: timestamp('last_sync_at'),
  lastSyncError: text('last_sync_error'),
  imapUidValidity: integer('imap_uid_validity'),
  imapLastUid: integer('imap_last_uid').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const emailThreads = pgTable('email_threads', {
  id: uuid('id').defaultRandom().primaryKey(),
  mailboxId: uuid('mailbox_id')
    .references(() => mailboxes.id, { onDelete: 'cascade' })
    .notNull(),
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  subject: text('subject').notNull(),
  /** Normalised RFC Message-ID of the first message in the thread. */
  rootMessageId: text('root_message_id').notNull(),
  lastMessageAt: timestamp('last_message_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const emailMessages = pgTable('email_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  threadId: uuid('thread_id')
    .references(() => emailThreads.id, { onDelete: 'cascade' })
    .notNull(),
  mailboxId: uuid('mailbox_id')
    .references(() => mailboxes.id, { onDelete: 'cascade' })
    .notNull(),
  direction: text('direction').$type<EmailDirection>().notNull(),
  /** inbound messages are always 'sent'; outbound: pending → sent / failed. */
  status: text('status').$type<EmailStatus>().default('sent').notNull(),
  /** RFC Message-ID, unique per mailbox. Outbound pending may use a CRM-generated id. */
  messageId: text('message_id').notNull(),
  inReplyTo: text('in_reply_to'),
  references: text('references'),
  fromAddress: text('from_address').notNull(),
  toAddresses: jsonb('to_addresses').$type<string[]>().notNull().default([]),
  ccAddresses: jsonb('cc_addresses').$type<string[]>().notNull().default([]),
  subject: text('subject').notNull(),
  bodyText: text('body_text').notNull(),
  /** Stored but never rendered in v1 UI (XSS guard). Capped at ~200 KB on ingest. */
  bodyHtml: text('body_html'),
  sentAt: timestamp('sent_at'),
  receivedAt: timestamp('received_at'),
  /** IMAP UID; null for outbound messages. */
  imapUid: integer('imap_uid'),
  sentByUserId: uuid('sent_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  /** Last SMTP/IMAP error for failed outbound messages. */
  lastError: text('last_error'),
  /** v1: no attachment blobs stored; flag indicates attachments were present. */
  hasAttachments: boolean('has_attachments').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Boards (work kanban — ADR-0026) ─────────────────────────────────────────
// Physical table names keep the former plugin `tb_*` prefix so existing installs
// migrate in place. Domain name in code/API is Boards.

export const tbProjects = pgTable('tb_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color').notNull().default('#6366f1'),
  /** Short unique prefix for task ids, e.g. FIN → FIN-01 */
  key: text('key').notNull(),
  /** Last allocated task number in this project */
  taskSeq: integer('task_seq').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tbModules = pgTable('tb_modules', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .references(() => tbProjects.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  description: text('description'),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tbStatuses = pgTable('tb_statuses', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => tbProjects.id, { onDelete: 'cascade' }),
  moduleId: uuid('module_id').references(() => tbModules.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#8F949C'),
  position: integer('position').notNull().default(0),
  isBacklog: boolean('is_backlog').notNull().default(false),
  isDone: boolean('is_done').notNull().default(false),
  /** Soft-cancel column — tasks here are purged after 7 days (canceledAt). */
  isCanceled: boolean('is_canceled').notNull().default(false),
});

export const tbTasks = pgTable('tb_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  moduleId: uuid('module_id')
    .references(() => tbModules.id, { onDelete: 'cascade' })
    .notNull(),
  statusId: uuid('status_id').references(() => tbStatuses.id, { onDelete: 'set null' }),
  parentTaskId: uuid('parent_task_id'),
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority').notNull().default('medium'),
  position: integer('position').notNull().default(0),
  number: integer('number').notNull(),
  identifier: text('identifier').notNull(),
  dueDate: timestamp('due_date', { withTimezone: true }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  /** Reserved for Pokelo document sync (ADR-0026 V2) — unused in V1. */
  pokeloDocumentId: uuid('pokelo_document_id'),
  /** Set when moved into an isCanceled status; cleared when moved out. Purge after 7d. */
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tbTaskAssignees = pgTable(
  'tb_task_assignees',
  {
    taskId: uuid('task_id')
      .references(() => tbTasks.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.taskId, t.userId] }) }),
);

export const tbTags = pgTable('tb_tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color').notNull().default('#6366f1'),
});

export const tbTaskTags = pgTable(
  'tb_task_tags',
  {
    taskId: uuid('task_id')
      .references(() => tbTasks.id, { onDelete: 'cascade' })
      .notNull(),
    tagId: uuid('tag_id')
      .references(() => tbTags.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.taskId, t.tagId] }) }),
);

export const tbTaskComments = pgTable('tb_task_comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  taskId: uuid('task_id')
    .references(() => tbTasks.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tbTaskActivity = pgTable('tb_task_activity', {
  id: uuid('id').defaultRandom().primaryKey(),
  taskId: uuid('task_id')
    .references(() => tbTasks.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Agent chat (Ask Khirby) ──────────────────────────────────────────────────

export type AgentMessageRole = 'user' | 'assistant';

export type AgentToolTraceEntry = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  summary: string;
};

export const agentConversations = pgTable('agent_conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agentMessages = pgTable('agent_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id')
    .references(() => agentConversations.id, { onDelete: 'cascade' })
    .notNull(),
  role: text('role').$type<AgentMessageRole>().notNull(),
  content: text('content').notNull(),
  toolTrace: jsonb('tool_trace').$type<AgentToolTraceEntry[] | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Plugin registry ──────────────────────────────────────────────────────────

export const plugins = pgTable('plugins', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  version: text('version').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  config: jsonb('config').$type<Record<string, string>>().default({}),
  installedAt: timestamp('installed_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
