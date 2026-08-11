// Shared types between API and Web

export type FormKind = 'contact' | 'waitlist' | 'wishlist' | 'feedback';

export interface SubmissionSource {
  referer?: string;
  userAgent?: string;
  ip?: string;
}

export interface Contact {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Submission {
  id: string;
  contactId: string;
  formId: string | null;
  data: Record<string, unknown>;
  source: SubmissionSource;
  listmonkSynced: boolean;
  createdAt: string;
}

export interface SubmissionWithContact extends Submission {
  contactEmail: string;
  contactName: string | null;
}

export interface SubmissionWithFormName extends Submission {
  formName: string | null;
}

export interface Form {
  id: string;
  name: string;
  slug: string;
  kind: FormKind;
  schema: FormField[];
  endpointToken: string;
  active: boolean;
  createdAt: string;
}

export interface FormListItem extends Form {
  submissionCount: number;
}

/**
 * Per-locale visitor-facing labels stored on a form field (ADR-0025).
 * Keys match SUPPORTED_LOCALE_CODES (`pl` | `en`). Missing entries fall back via
 * {@link resolveFormFieldLabel}.
 */
export type FormFieldLabels = {
  en?: string;
  pl?: string;
};

export interface FormField {
  name: string;
  /** Required fallback label (= EN / legacy single-language schemas). */
  label: string;
  /** Optional authored labels per locale; public GET resolves to `label`. */
  labels?: FormFieldLabels;
  type: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'checkbox' | 'number' | 'url';
  required: boolean;
  options?: string[]; // for select (wire values; optionLabels = follow-up)
}

/**
 * Resolve the visitor-facing label for a locale (ADR-0025).
 * Order: `labels[locale]` → `labels.en` → `label`.
 */
export function resolveFormFieldLabel(
  field: { label: string; labels?: FormFieldLabels },
  locale: 'pl' | 'en' = 'en',
): string {
  const fromLocale = field.labels?.[locale]?.trim();
  if (fromLocale) return fromLocale;
  const fromEn = field.labels?.en?.trim();
  if (fromEn) return fromEn;
  return field.label;
}

/** Public form definition returned by GET /api/public/forms/:token */
export interface PublicForm {
  name: string;
  slug: string;
  kind: FormKind;
  /** Fields with `label` already resolved for the requested locale (ADR-0025). */
  fields: FormField[];
}

export interface SubmitFormResult {
  success: true;
  contactId: string;
  submissionId: string;
}

export interface FormStatsFormBucket {
  formId: string;
  formName: string;
  count: number;
}

export interface FormStatsDayBucket {
  day: string;
  count: number;
}

export interface FormStats {
  total: number;
  activeForms: number;
  byForm: FormStatsFormBucket[];
  byDay?: FormStatsDayBucket[];
}

// --- Auth / session ---

/** The authenticated user as exposed by GET /api/auth/me and POST /api/auth/login. */
export interface SessionUser {
  id: string;
  email: string;
  /**
   * Interface language saved on the account, or `null` when none was chosen —
   * then the SPA follows the browser (ADR-0011). Typed as a plain string because
   * an older row may hold a code this build no longer registers; callers narrow
   * with `isLocaleCode` before applying it.
   */
  locale: string | null;
}

export interface LoginResponse {
  user: SessionUser;
}

// --- Members (GET /api/users) ---

/** A workspace member with its assigned roles. `isSelf` marks the caller's own row. */
export interface Member {
  id: string;
  email: string;
  createdAt: string;
  roles: { id: string; name: string }[];
  isSelf?: boolean;
}

// --- RBAC roles ---

/**
 * One granted permission on a role. Typed as plain strings to match the
 * persisted rows and the setPermissions payload; the *assignable* set is the
 * PERMISSION_RESOURCES / PERMISSION_ACTIONS catalog below.
 */
export interface RolePermission {
  resource: string;
  action: string;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions?: RolePermission[];
  isProtected?: boolean;
}

// --- Plugins (GET /api/plugins) ---

/**
 * Plugin-supplied UI metadata carries BOTH an English literal and an optional
 * message key (ADR-0011). NestJS ships no message catalog: the key is stable,
 * the SPA owns the copy, and a key the SPA does not know — a third-party plugin —
 * falls back to the literal, so a plugin is never unreadable.
 */
export interface PluginFrontendRoute {
  path: string;
  name: string;
  navLabel: string;
  navLabelKey?: string;
  navIcon: string;
  /** When false, omitted from sidebar / ⌘K (ADR-0023). Default true. */
  showInNav?: boolean;
}

export interface PluginConfigOption {
  value: string;
  label: string;
  labelKey?: string;
}

export interface PluginConfigPlaceholder {
  token: string;
  label: string;
  labelKey?: string;
}

export interface PluginConfigField {
  key: string;
  label: string;
  labelKey?: string;
  type: 'text' | 'password' | 'url' | 'select' | 'api-multiselect' | 'textarea' | 'multiselect';
  description?: string;
  descriptionKey?: string;
  placeholder?: string;
  required?: boolean;
  options?: PluginConfigOption[];
  optionsUrl?: string;
  placeholders?: PluginConfigPlaceholder[];
}

export interface Plugin {
  id: string;
  name: string;
  /** Seeded English literal from the plugin, straight off the row. */
  displayName: string;
  /** Key the SPA resolves instead, supplied by the live plugin (not the row). */
  displayNameKey?: string;
  description: string | null;
  descriptionKey?: string;
  version: string;
  enabled: boolean;
  config: Record<string, string>;
  configSchema?: PluginConfigField[];
  installedAt: string;
  updatedAt: string;
  frontendRoutes?: PluginFrontendRoute[];
}

/**
 * Canonical RBAC permission catalog — single source of truth shared by the API
 * (bootstrap super-admin sync + PermissionDto validation) and the web roles UI,
 * so the set of assignable resources/actions can never drift between them.
 */
export const PERMISSION_RESOURCES = [
  'contacts',
  'forms',
  'leads',
  'newsletter',
  'settings',
  'integrations',
  'roles',
  'users',
  'boards',
] as const;

export type PermissionResource = (typeof PERMISSION_RESOURCES)[number];

export const PERMISSION_ACTIONS = ['manage'] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/** Every valid (resource, action) pair — used to grant super-admin full access. */
export const ALL_PERMISSIONS: ReadonlyArray<{
  resource: PermissionResource;
  action: PermissionAction;
}> = PERMISSION_RESOURCES.map((resource) => ({ resource, action: 'manage' as const }));

// --- Locales (ADR-0011) ---

/**
 * Locale codes the SPA ships. Shared so the API can validate an account's saved
 * locale against exactly the list the switcher renders — the web registry
 * (`apps/web/src/i18n/locales.ts`) carries the endonyms and Intl tags on top.
 */
export const SUPPORTED_LOCALE_CODES = ['pl', 'en'] as const;

export type LocaleCode = (typeof SUPPORTED_LOCALE_CODES)[number];

export function isLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === 'string' && (SUPPORTED_LOCALE_CODES as readonly string[]).includes(value);
}

// --- Seeded text (ADR-0011) ---

/**
 * Text the API seeds into the database on first boot. The SPA localizes such a
 * row **by identifier**, and only while the row still matches the seed literal
 * below — once an operator renames it, their own words win and stay. Seeded rows
 * are therefore never rewritten in the database, in any language.
 *
 * These literals are the contract between the seeder and that lookup, so they
 * live here rather than being duplicated on both sides.
 */
export const SUPER_ADMIN_ROLE_NAME = 'super-admin';

export const SUPER_ADMIN_ROLE_DESCRIPTION = 'Full access to everything';

/** The five stages a fresh install starts with, in seed order. */
export const DEFAULT_PIPELINE_STAGE_NAMES = [
  'New Lead',
  'Meeting Set',
  'Negotiation',
  'Won',
  'Lost',
] as const;

export type DefaultPipelineStageName = (typeof DEFAULT_PIPELINE_STAGE_NAMES)[number];

export type LeadPriority = 'low' | 'medium' | 'high';

export interface PipelineStage {
  id: string;
  name: string;
  color: string;
  position: number;
  isWon: boolean;
  isLost: boolean;
}

export interface Lead {
  id: string;
  contactId: string;
  submissionId: string | null;
  stageId: string;
  ownerId: string | null;
  title: string;
  value: string | null;
  priority: LeadPriority;
  formName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadBoardItem extends Lead {
  contactEmail: string;
  contactName: string | null;
  ownerEmail: string | null;
  /**
   * True when the newest message on any thread linked to this lead is inbound
   * (contact replied — operator should look). No per-user unread state.
   */
  hasNewMail: boolean;
  /** ISO timestamp of that thread's last activity, or null when no mail. */
  lastMailAt: string | null;
}

export interface LeadBoardColumn {
  stage: PipelineStage;
  leads: LeadBoardItem[];
  totalValue: string;
  count: number;
}

export interface LeadBoard {
  columns: LeadBoardColumn[];
}

export interface LeadComment {
  id: string;
  leadId: string;
  userId: string | null;
  userEmail: string | null;
  body: string;
  createdAt: string;
}

export interface LeadDetail extends LeadBoardItem {
  submission: Submission | null;
  comments: LeadComment[];
}

export interface LeadAssignee {
  id: string;
  email: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiResponse<T> {
  data: T;
}

// ─── Mail (core firm mailbox) ────────────────────────────────────────────────

export type MailConnectionStatus = 'disconnected' | 'connected' | 'reconnecting' | 'error';
export type MessageDirection = 'inbound' | 'outbound';
export type MessageStatus = 'pending' | 'sent' | 'failed';

export type MailboxAuthMethod = 'password' | 'google_oauth';

/** Public mailbox config — no plaintext passwords or OAuth tokens. */
export interface MailboxPublic {
  id: string;
  name: string;
  fromName: string;
  fromAddress: string;
  authMethod: MailboxAuthMethod;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  /** true when an IMAP password is stored; the password itself is never returned. */
  hasImapPassword: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  /** true when an SMTP password is stored; the password itself is never returned. */
  hasSmtpPassword: boolean;
  /** true when a Google OAuth refresh token is stored. */
  hasOauthToken: boolean;
  enabled: boolean;
  connectionStatus: MailConnectionStatus;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  backfillDays: number;
  /** true when MAIL_SECRETS_KEY env var is configured on the server. */
  secretsKeyConfigured: boolean;
  /** true when GOOGLE_MAIL_CLIENT_ID + SECRET are set on the server. */
  googleOAuthConfigured: boolean;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/mail/mailbox — mailbox may be null before first save / OAuth connect. */
export interface MailboxGetResponse {
  mailbox: MailboxPublic | null;
  googleOAuthConfigured: boolean;
  secretsKeyConfigured: boolean;
}

/** Thread row in a paginated list. */
export interface EmailThreadSummary {
  id: string;
  subject: string;
  contactId: string | null;
  contactEmail: string | null;
  contactName: string | null;
  leadId: string | null;
  leadTitle: string | null;
  lastMessageAt: string;
  messageCount: number;
  /** direction of the most recent message */
  lastDirection: MessageDirection;
  createdAt: string;
}

/** One email message as returned by GET /api/mail/threads/:id — bodyHtml excluded from FE. */
export interface EmailMessagePublic {
  id: string;
  threadId: string;
  direction: MessageDirection;
  status: MessageStatus;
  fromAddress: string;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  bodyText: string;
  sentAt: string | null;
  receivedAt: string | null;
  sentByUserId: string | null;
  hasAttachments: boolean;
  lastError: string | null;
}

/** Thread detail with all messages (oldest → newest). */
export interface EmailThreadDetail extends EmailThreadSummary {
  messages: EmailMessagePublic[];
}

/** Paginated response for thread lists (matches API shape). */
export interface PaginatedThreads {
  items: EmailThreadSummary[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Error contract (ADR-0011) ───────────────────────────────────────────────
//
// The SPA renders API failures, so it needs a stable machine-readable reason to
// translate. Codes travel; prose does not. `message` stays populated with the
// English text so pre-existing `catch (e) { error.value = e.message }` call
// sites keep working — this contract is additive, never breaking.

export const ERROR_CODES = [
  'NOT_FOUND',
  'ALREADY_EXISTS',
  'SYSTEM_ENTITY_IMMUTABLE',
  'LAST_SUPER_ADMIN',
  'SELF_DELETE_FORBIDDEN',
  'INVALID_CREDENTIALS',
  'CURRENT_PASSWORD_INVALID',
  'SESSION_EXPIRED',
  'FORBIDDEN',
  'SUPER_ADMIN_REQUIRED',
  'VALIDATION_FAILED',
  'BAD_REQUEST',
  'PLUGIN_DISABLED',
  'PLUGIN_NOT_CONFIGURED',
  'UPSTREAM_FAILED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Which entity a code is about, plus anything the UI interpolates. Structured on
 * purpose: a pre-interpolated "Role <id> not found" cannot be translated.
 */
export interface ErrorParams {
  entity?: string;
  id?: string;
  name?: string;
  slug?: string;
  email?: string;
  [key: string]: string | number | undefined;
}

/** One failed DTO field. `constraint` is the class-validator rule name. */
export interface FieldError {
  field: string;
  constraint: string;
  /** English fallback — used until a constraint has a translated counterpart. */
  message: string;
}

/** The body every non-2xx response carries. */
export interface ApiErrorBody {
  statusCode: number;
  code: ErrorCode;
  /** English text. Always present, so an untranslated code still reads sensibly. */
  message: string;
  params?: ErrorParams;
  /** Present only for VALIDATION_FAILED. */
  fields?: FieldError[];
}
