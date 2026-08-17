/**
 * CRM Khirby Plugin SDK
 * Minimalne interfejsy potrzebne do pisania pluginów.
 */

/**
 * Minimal postgres.js client surface used by plugin migrations.
 * Avoids a hard dependency on the `postgres` package in this SDK.
 */
export type PluginSqlClient = {
  unsafe: (query: string, params?: unknown[]) => Promise<unknown>;
};

// ─── Typy eventów ─────────────────────────────────────────────────────────────

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

// ─── Kontekst pluginu ─────────────────────────────────────────────────────────

export interface PluginContext {
  /** Logger z prefiksem nazwy pluginu */
  log: (message: string, ...args: unknown[]) => void;
  /** Konfiguracja z env vars / plugin settings */
  config: Record<string, string | undefined>;
}

// ─── Frontend pluginu ─────────────────────────────────────────────────────────

export interface PluginFrontendRoute {
  /** Ścieżka routera Vue, np. '/plugins/listmonk' */
  path: string;
  /** Nazwa trasy, np. 'plugin-listmonk' */
  name: string;
  /** Label w nawigacji — English literal, used as the fallback (ADR-0011) */
  navLabel: string;
  /**
   * Optional message key the SPA resolves instead of `navLabel`. The backend
   * ships no catalog: it declares a stable key, the SPA owns the copy, and an
   * unknown key (a third-party plugin) falls back to the literal above.
   */
  navLabelKey?: string;
  /** Ikona emoji */
  navIcon: string;
  /**
   * When false, the route is still registered but omitted from the sidebar
   * Plugins group and ⌘K. Use for settings-only pages discovered via
   * Settings → Plugins → Configure (ADR-0023). Default true when omitted.
   */
  showInNav?: boolean;
  /**
   * Komponent Vue – lazy import, np.:
   *   () => import('@khirby/plugin-listmonk/views/ListmonkView.vue')
   * Plugin-sdk jest package-agnostic; konkretny plugin wstrzykuje funkcję importu.
   * Prefer `exports["./web"]` (PluginWebEntry) for npm packages — the SPA merges
   * the real component from the generated registry keyed by CrmPlugin.name.
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
  /** Lazy component loader — supplied by the plugin's ./web entry */
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

// ─── Schemat konfiguracji (UI w panelu Plugins) ───────────────────────────────

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
  /** Klucz zapisywany w DB (np. LISTMONK_URL) */
  key: string;
  /** Etykieta widoczna dla użytkownika — English literal, used as the fallback */
  label: string;
  /** Message key the SPA resolves instead of `label`; falls back to it if unknown */
  labelKey?: string;
  type: PluginConfigFieldType;
  description?: string;
  /** Message key the SPA resolves instead of `description` */
  descriptionKey?: string;
  placeholder?: string;
  required?: boolean;
  /** Dla type === 'select' | 'multiselect' */
  options?: PluginConfigOption[];
  /** Dla type === 'api-multiselect' — ścieżka API zwracająca opcje */
  optionsUrl?: string;
  /** Legend of auto-filled `{{token}}` values (shown under textarea templates) */
  placeholders?: PluginConfigPlaceholder[];
}

// ─── Interfejs pluginu ────────────────────────────────────────────────────────

export interface CrmPlugin {
  /** Unikalny identyfikator pluginu (snake_case) */
  name: string;

  /** Czytelna nazwa — English literal, seeded into the DB and used as the fallback */
  displayName: string;

  /**
   * Message key the SPA resolves instead of `displayName`. Read from the live
   * plugin, never from the seeded row: the database keeps the English seed so a
   * plugin's identity does not depend on the operator's UI language (ADR-0011).
   */
  displayNameKey?: string;

  /** Krótki opis */
  description?: string;

  /** Message key the SPA resolves instead of `description` */
  descriptionKey?: string;

  /** Wersja semver */
  version: string;

  /**
   * Optional hook called by PluginRegistryService before onInit.
   * Plugin runs its own SQL migrations (CREATE TABLE IF NOT EXISTS).
   * Receives the raw postgres.js sql client (`db.$client`).
   */
  onMigrate?(sql: PluginSqlClient): Promise<void>;

  /**
   * Wywoływane raz przy rejestracji pluginu.
   */
  onInit?(ctx: PluginContext): Promise<void> | void;

  /**
   * Obsługa eventów CRM.
   */
  onEvent?(event: CrmEvent, ctx: PluginContext): Promise<void> | void;

  /**
   * Opcjonalny NestJS DynamicModule dostarczający własne kontrolery/serwisy.
   * PluginsModule.forRoot() automatycznie go importuje.
   */
  getNestModule?(): any;

  /**
   * Trasy frontendowe które plugin chce dodać do routera Vue.
   * Zwracane tylko gdy plugin jest włączony.
   */
  getFrontendRoutes?(): PluginFrontendRoute[];

  /**
   * Pola konfiguracji wyświetlane w panelu Plugins → Configure.
   * Brak metody = plugin bez ustawień w UI.
   */
  getConfigSchema?(): PluginConfigField[];
}

/**
 * Factory every installable plugin package must export (ADR-0016).
 * Prefer named `createPlugin` over a default class export.
 */
export type CreatePlugin = () => CrmPlugin;

// ─── Token iniekcji NestJS ────────────────────────────────────────────────────

export const CRM_PLUGINS = 'CRM_PLUGINS';
