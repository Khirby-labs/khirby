/**
 * CRM Khirby Plugin SDK — minimal interfaces for authoring plugins.
 */

/**
 * Minimal postgres.js client surface used by plugin migrations.
 * Avoids a hard dependency on the `postgres` package in this SDK.
 */
export type PluginSqlClient = {
  unsafe: (query: string, params?: unknown[]) => Promise<unknown>;
};

export interface ContactCreatedEvent {
  type: 'contact.created';
  payload: {
    id: string;
    email: string;
    name?: string | null;
    metadata?: Record<string, unknown>;
    createdAt: Date;
  };
}

export interface FormSubmittedEvent {
  type: 'form.submitted';
  payload: {
    submissionId: string;
    formId: string;
    formSlug: string;
    formName: string;
    contactId: string;
    contactEmail: string;
    data: Record<string, unknown>;
    createdAt: Date;
  };
}

export interface LeadCreatedEvent {
  type: 'lead.created';
  payload: {
    id: string;
    title: string;
    email: string;
    name?: string | null;
    stageId: string;
    stageName: string;
    value?: string | null;
    priority: string;
    formName?: string | null;
    contactId: string;
    createdAt: Date;
  };
}

export interface LeadMovedEvent {
  type: 'lead.moved';
  payload: {
    id: string;
    title: string;
    email: string;
    name?: string | null;
    oldStageId: string;
    oldStageName: string;
    newStageId: string;
    newStageName: string;
  };
}

export interface LeadDeletedEvent {
  type: 'lead.deleted';
  payload: {
    id: string;
    title: string;
    email: string;
    stageId: string;
    stageName: string;
  };
}

export interface EmailReceivedEvent {
  type: 'email.received';
  payload: {
    messageId: string;
    threadId: string;
    mailboxId: string;
    fromAddress: string;
    toAddresses: string[];
    subject: string;
    bodyText: string;
    contactId?: string | null;
    leadId?: string | null;
    receivedAt: Date;
  };
}

export interface EmailSentEvent {
  type: 'email.sent';
  payload: {
    messageId: string;
    threadId: string;
    mailboxId: string;
    fromAddress: string;
    toAddresses: string[];
    subject: string;
    bodyText: string;
    contactId?: string | null;
    leadId?: string | null;
    sentByUserId?: string | null;
    sentAt: Date;
  };
}

export type CrmEvent =
  | ContactCreatedEvent
  | FormSubmittedEvent
  | LeadCreatedEvent
  | LeadMovedEvent
  | LeadDeletedEvent
  | EmailReceivedEvent
  | EmailSentEvent;

export interface PluginContext {
  log: (message: string, ...args: unknown[]) => void;
  config: Record<string, string | undefined>;
}

export interface PluginFrontendRoute {
  path: string;
  name: string;
  /** English literal used as the i18n fallback (ADR-0011) */
  navLabel: string;
  /**
   * Optional message key the SPA resolves instead of `navLabel`. The backend
   * ships no catalog: it declares a stable key, the SPA owns the copy, and an
   * unknown key (a third-party plugin) falls back to the literal above.
   */
  navLabelKey?: string;
  navIcon: string;
  /**
   * When false, the route is still registered but omitted from the sidebar
   * Plugins group and ⌘K. Use for settings-only pages discovered via
   * Settings → Plugins → Configure (ADR-0023). Default true when omitted.
   */
  showInNav?: boolean;
  /**
   * Lazy Vue component. Prefer `exports["./web"]` (`PluginWebEntry`) for npm
   * packages — the SPA merges the real component from the generated registry
   * keyed by `CrmPlugin.name`.
   */
  component: () => Promise<any>;
}

/**
 * Serialisable child-route shape for plugin Vue packages (ADR-0016).
 * Mirrors vue-router RouteRecordRaw fields the SPA needs; avoids a hard vue-router
 * dependency in this SDK.
 */
export interface PluginWebChildRoute {
  path: string;
  name?: string;
  component?: () => Promise<unknown>;
  redirect?: string | { name: string };
  meta?: Record<string, unknown>;
  children?: PluginWebChildRoute[];
}

/**
 * Vue entry exported from a plugin package at `exports["./web"]`.
 * `name` MUST equal `CrmPlugin.name` so the SPA can merge routes with API metadata.
 */
export interface PluginWebEntry {
  name: string;
  component: () => Promise<unknown>;
  children?: PluginWebChildRoute[];
  /** Optional i18n catalogs merged at register time; unknown keys fall back to literals */
  messages?: {
    en?: Record<string, unknown>;
    pl?: Record<string, unknown>;
  };
}

export type PluginConfigFieldType =
  'text' | 'password' | 'url' | 'select' | 'api-multiselect' | 'textarea' | 'multiselect';

/** One choice of a `select` field. `labelKey` wins in the SPA when it resolves. */
export interface PluginConfigOption {
  value: string;
  label: string;
  labelKey?: string;
}

/** Token shown in a template-field legend; rendered as `{{token}}` in the SPA. */
export interface PluginConfigPlaceholder {
  token: string;
  label: string;
  labelKey?: string;
}

export interface PluginConfigField {
  key: string;
  /** English literal used as the i18n fallback */
  label: string;
  /** Message key the SPA resolves instead of `label`; falls back to it if unknown */
  labelKey?: string;
  type: PluginConfigFieldType;
  description?: string;
  /** Message key the SPA resolves instead of `description` */
  descriptionKey?: string;
  placeholder?: string;
  required?: boolean;
  options?: PluginConfigOption[];
  /** For `api-multiselect` — API path that returns options */
  optionsUrl?: string;
  /** Legend of auto-filled `{{token}}` values (shown under textarea templates) */
  placeholders?: PluginConfigPlaceholder[];
}

export interface CrmPlugin {
  /** Unique plugin id (snake_case) */
  name: string;

  /** English literal, seeded into the DB and used as the i18n fallback */
  displayName: string;

  /**
   * Message key the SPA resolves instead of `displayName`. Read from the live
   * plugin, never from the seeded row: the database keeps the English seed so a
   * plugin's identity does not depend on the operator's UI language (ADR-0011).
   */
  displayNameKey?: string;

  description?: string;

  /** Message key the SPA resolves instead of `description` */
  descriptionKey?: string;

  version: string;

  /**
   * Optional hook called by PluginRegistryService before onInit.
   * Plugin runs its own SQL migrations (CREATE TABLE IF NOT EXISTS).
   * Receives the raw postgres.js sql client (`db.$client`).
   */
  onMigrate?(sql: PluginSqlClient): Promise<void>;

  /**
   * Optional hook called by PluginRegistryService on uninstall.
   * Drop plugin-owned tables and other persistent artifacts.
   */
  onUninstall?(sql: PluginSqlClient): Promise<void>;

  onInit?(ctx: PluginContext): Promise<void> | void;

  onEvent?(event: CrmEvent, ctx: PluginContext): Promise<void> | void;

  /** Optional NestJS DynamicModule providing the plugin's own controllers/services */
  getNestModule?(): any;

  /** Frontend routes to register when the plugin is enabled */
  getFrontendRoutes?(): PluginFrontendRoute[];

  /** Fields shown in Plugins → Configure; omit for plugins with no UI settings */
  getConfigSchema?(): PluginConfigField[];
}

/**
 * Factory every installable plugin package must export (ADR-0016).
 * Prefer named `createPlugin` over a default class export.
 */
export type CreatePlugin = () => CrmPlugin;

export const CRM_PLUGINS = 'CRM_PLUGINS';
