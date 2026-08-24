/**
 * Injection tokens and narrow interfaces for Nest plugins (ADR-0016).
 * The host app provides concrete implementations via PluginBridgeModule.
 */

/** Drizzle DB instance — same string token the API has always used. */
export const DB_TOKEN = 'DB';

/** Opaque drizzle client; plugins should prefer plugin-owned tables via onMigrate. */
export type Db = any;

export const RBAC_SERVICE = 'CRM_RBAC_SERVICE';

export interface RbacServiceLike {
  hasPermission(userId: string, resource: string, action: string): Promise<boolean>;
  isSuperAdmin(userId: string): Promise<boolean>;
}

export const PLUGIN_REGISTRY = 'CRM_PLUGIN_REGISTRY';

export interface PluginRegistryLike {
  findByName(name: string): Promise<{
    name: string;
    enabled: boolean;
    config: Record<string, string> | null;
  } | null>;
  isEnabled?(name: string): boolean;
}

export const CONTACTS_SERVICE = 'CRM_CONTACTS_SERVICE';
export const LEADS_SERVICE = 'CRM_LEADS_SERVICE';
export const USERS_SERVICE = 'CRM_USERS_SERVICE';
export const PIPELINE_STAGES_SERVICE = 'CRM_PIPELINE_STAGES_SERVICE';
export const EVENTS_SERVICE = 'CRM_EVENTS_SERVICE';
export const MAIL_THREAD_SERVICE = 'CRM_MAIL_THREAD_SERVICE';
export const MAIL_SEND_SERVICE = 'CRM_MAIL_SEND_SERVICE';

/** Narrow contacts surface for plugins / MCP (ADR-0016, ADR-0028). */
export interface ContactsServiceLike {
  findAll(query?: { page?: number; pageSize?: number; search?: string }): Promise<unknown>;
  findById(id: string): Promise<unknown | null>;
  create(dto: {
    email: string;
    name?: string;
    phone?: string;
    metadata?: Record<string, unknown>;
  }): Promise<unknown>;
  update(
    id: string,
    dto: {
      email?: string;
      name?: string;
      phone?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<unknown>;
}

export type LeadPriority = 'low' | 'medium' | 'high';

/** Narrow leads surface for plugins / MCP (ADR-0016, ADR-0028). */
export interface LeadsServiceLike {
  getBoard(ownerId?: string): Promise<unknown>;
  findById(id: string): Promise<unknown | null>;
  getAssignees(): Promise<unknown>;
  createManual(dto: {
    email: string;
    name?: string;
    title?: string;
    value?: string;
    priority?: LeadPriority;
    stageId?: string;
    ownerId?: string;
  }): Promise<unknown>;
  update(
    id: string,
    dto: {
      title?: string;
      value?: string | null;
      priority?: LeadPriority;
      stageId?: string;
      ownerId?: string | null;
    },
  ): Promise<unknown>;
}

/** Narrow users surface for plugins / MCP. */
export interface UsersServiceLike {
  findAll(currentUserId?: string): Promise<unknown>;
}

export interface PipelineStagesServiceLike {
  ensureDefaults(): Promise<void>;
  findAll(): Promise<unknown>;
}

/** Narrow mail-thread surface for plugins (ADR-0017, ADR-0019). */
export interface MailThreadServiceLike {
  listThreads(opts: {
    contactId?: string;
    leadId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: Array<{
      id: string;
      subject: string;
      contactId: string | null;
      contactEmail: string | null;
      contactName: string | null;
      leadId: string | null;
      leadTitle: string | null;
      lastMessageAt: string;
      messageCount: number;
      lastDirection: 'inbound' | 'outbound';
      createdAt: string;
    }>;
    total: number;
    page: number;
    pageSize: number;
  }>;

  getThread(id: string): Promise<{
    id: string;
    subject: string;
    contactId: string | null;
    contactEmail: string | null;
    contactName: string | null;
    leadId: string | null;
    leadTitle: string | null;
    lastMessageAt: string;
    messageCount: number;
    lastDirection: 'inbound' | 'outbound';
    createdAt: string;
    messages: Array<{
      id: string;
      direction: 'inbound' | 'outbound';
      status: string;
      fromAddress: string | null;
      toAddresses: string[];
      subject: string;
      bodyText: string;
      sentAt: string | null;
      receivedAt: string | null;
      createdAt: string;
    }>;
  }>;
}

/** Narrow outbound mail surface for plugins (ADR-0019). */
export interface MailSendServiceLike {
  createThread(input: {
    contactId?: string;
    leadId?: string;
    toAddress?: string;
    subject: string;
    bodyText: string;
    sentByUserId: string;
  }): Promise<{ threadId: string; messageId: string }>;

  reply(input: {
    threadId: string;
    bodyText: string;
    sentByUserId: string;
  }): Promise<{ messageId: string }>;
}

/** Work boards — projects / modules / tasks / statuses (ADR-0026 / ADR-0027). */
export const BOARD_PROJECTS_SERVICE = 'CRM_BOARD_PROJECTS_SERVICE';
export const BOARD_MODULES_SERVICE = 'CRM_BOARD_MODULES_SERVICE';
export const BOARD_TASKS_SERVICE = 'CRM_BOARD_TASKS_SERVICE';
export const BOARD_STATUSES_SERVICE = 'CRM_BOARD_STATUSES_SERVICE';

export interface BoardProjectsServiceLike {
  findAll(): Promise<unknown>;
  findById(id: string): Promise<unknown>;
  create(
    dto: { name: string; description?: string; color?: string; key?: string },
    userId: string,
  ): Promise<unknown>;
  update(
    id: string,
    dto: { name?: string; description?: string | null; color?: string; key?: string },
  ): Promise<unknown>;
  delete(id: string): Promise<void>;
}

export interface BoardModulesServiceLike {
  findByProject(projectId: string): Promise<unknown>;
  findById(id: string): Promise<unknown>;
  create(dto: {
    projectId: string;
    name: string;
    description?: string;
    position?: number;
  }): Promise<unknown>;
  update(id: string, dto: { name?: string; description?: string | null }): Promise<unknown>;
  delete(id: string): Promise<void>;
}

export type BoardTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface BoardTasksServiceLike {
  findByProject(
    projectId: string,
    filters?: {
      moduleId?: string;
      assigneeId?: string;
      priority?: string;
      statusId?: string;
      tagId?: string;
    },
  ): Promise<unknown>;
  findByModule(moduleId: string): Promise<unknown>;
  findById(id: string): Promise<unknown>;
  findByIdentifier(identifier: string): Promise<unknown>;
  getAssignees(): Promise<unknown>;
  create(
    dto: {
      moduleId: string;
      title: string;
      description?: string;
      priority?: BoardTaskPriority;
      statusId?: string;
      parentTaskId?: string;
      dueDate?: string | null;
      leadId?: string | null;
      assigneeIds?: string[];
      tagIds?: string[];
    },
    userId: string,
  ): Promise<unknown>;
  update(
    id: string,
    dto: {
      title?: string;
      description?: string | null;
      priority?: BoardTaskPriority;
      statusId?: string | null;
      dueDate?: string | null;
      leadId?: string | null;
      moduleId?: string;
      assigneeIds?: string[];
      tagIds?: string[];
    },
    userId: string,
  ): Promise<unknown>;
  updateStatus(id: string, statusId: string, position: number, userId: string): Promise<unknown>;
  addComment(taskId: string, body: string, userId: string): Promise<unknown>;
  delete(id: string): Promise<void>;
}

export interface BoardStatusesServiceLike {
  findByProject(projectId: string): Promise<unknown>;
  findByModule(moduleId: string): Promise<unknown>;
}

/**
 * Optional cross-plugin RAG context (ADR-0022).
 * Provided by crm-plugin-pokelo (@Global); consumers use @Optional().
 */
export const POKELO_CONTEXT_SERVICE = 'POKELO_CONTEXT_SERVICE';

export type PokeloFetchOpts = {
  /** Subset of bound project IDs to search; defaults to all bound projects. */
  projectIds?: string[];
};

export interface PokeloContextServiceLike {
  /** RAG snippets for LLM system prompt; '' if unconfigured/disabled/error. */
  fetchContext(query: string, opts?: PokeloFetchOpts): Promise<string>;
  /** Projects selected in Pokelo settings (id + name for routing). */
  listBoundProjects?(): Promise<Array<{ id: string; name: string }>>;
  /** All projects visible to the configured token (settings UI). */
  listProjects?(): Promise<Array<{ id: string; name: string }>>;
}

/**
 * Instance-volume plugins (ADR-0036, ADR-0038). Provided by PluginsModule.
 * MCP and in-app chat consume this token — never import `apps/api`.
 */
export const INSTANCE_PLUGINS = 'CRM_INSTANCE_PLUGINS';

export type InstancePluginScaffoldInput = {
  directory: string;
  name: string;
  displayName?: string;
  nest?: boolean;
};

export interface InstancePluginsLike {
  /** Writable `plugins/` dir (`INSTANCE_PLUGINS_DIR` or repo `plugins/`). */
  instanceDir(): string;
  /** Absolute package dir for one volume segment (rejects `..` / nested paths). */
  packageDir(directory: string): string;
  /** Names that must not be scaffolded or hot-loaded (natives + `crm_hello`). */
  reservedNames(): readonly string[];
  /** Plugins already in this process (image + previously hot-loaded). */
  loadedNames(): string[];
  /** Volume folder for a loaded `crm_*` name, or null when the plugin is not on the instance volume. */
  instanceDirectory(name: string): string | null;
  /**
   * SPA pages from a loaded plugin's `getFrontendRoutes()` — only paths under
   * `/plugins/` (same rule as instance validation). Empty when unknown / no UI.
   * Callers must copy these paths; never invent URLs from name or directory.
   */
  frontendPages(name: string): Array<{ path: string; navLabel: string }>;
  /**
   * Load `createPlugin()` from a directory on the volume, push onto the live
   * registry, optionally LazyModuleLoader, then install+activate.
   */
  hotLoad(absPackageDir: string): Promise<{ name: string }>;
  /** Same rules as hotLoad, without mutating the process. */
  validate(absPackageDir: string): { name: string };
  /** validate → manifest → hotLoad (first time) or enable/install row (retry). */
  installFromDirectory(
    localDir: string,
    packageName?: string,
  ): Promise<{ name: string; status: 'installed' | 're-enabled' | 'already_active' }>;
  /** Delete volume files, manifest entry, and DB row (process memory until restart). */
  removeInstance(localDir: string): Promise<{ name: string }>;
  appendManifest(packageName: string, localDir: string): void;
  /** Shared authoring contract (events, volume, ./web ban). */
  pluginContract(): string;
  scaffold(input: InstancePluginScaffoldInput): { directory: string; files: string[] };
  writeFile(
    directory: string,
    path: string,
    content: string,
  ): { directory: string; path: string; bytes: number };
  /**
   * Re-read a volume plugin already in this process and rebind its GET handlers.
   * No-op (not_loaded) when the name is not in the live registry yet.
   */
  reloadFromDirectory(
    localDir: string,
  ): Promise<{ name: string; status: 'reloaded' | 'not_loaded' }>;
  readFile(directory: string, path: string): { directory: string; path: string; content: string };
  listFiles(directory: string): { directory: string; files: string[] };
}

/** Marker metadata key for PluginEnabledGuard */
export const PLUGIN_NAME_KEY = 'crm-plugin-name';

/**
 * BYOK LLM config from crm-plugin-ai-compose (ADR-0040).
 * Agent chat consumes this token — @Optional() when plugin is absent.
 */
export const AI_COMPOSE_LLM = 'AI_COMPOSE_LLM';

export interface AiComposeLlmLike {
  getCompletionConfig(): Promise<{
    baseUrl: string;
    apiKey: string;
    model: string;
  } | null>;
}
