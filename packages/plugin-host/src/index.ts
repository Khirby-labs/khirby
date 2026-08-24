/**
 * @khirby/plugin-host — stable Nest surface for CRM plugins (ADR-0016).
 *
 * Community plugins must import from this package (and @khirby/plugin-sdk) only —
 * never from apps/api.
 */

export { AppException } from './app-exception';
export { SessionGuard } from './session.guard';
export { PermissionGuard } from './permission.guard';
export { PluginEnabledGuard } from './plugin-enabled.guard';
export { RequirePluginEnabled } from './require-plugin-enabled.decorator';
export {
  RequirePermission,
  RequireSuperAdmin,
  RequireAnyPermission,
  PERMISSION_KEY,
  PERMISSION_ANY_KEY,
  SUPER_ADMIN_KEY,
} from './require-permission.decorator';
export {
  DB_TOKEN,
  type Db,
  RBAC_SERVICE,
  type RbacServiceLike,
  PLUGIN_REGISTRY,
  type PluginRegistryLike,
  CONTACTS_SERVICE,
  type ContactsServiceLike,
  LEADS_SERVICE,
  type LeadsServiceLike,
  type LeadPriority,
  USERS_SERVICE,
  type UsersServiceLike,
  PIPELINE_STAGES_SERVICE,
  type PipelineStagesServiceLike,
  EVENTS_SERVICE,
  MAIL_THREAD_SERVICE,
  type MailThreadServiceLike,
  MAIL_SEND_SERVICE,
  type MailSendServiceLike,
  BOARD_PROJECTS_SERVICE,
  type BoardProjectsServiceLike,
  BOARD_MODULES_SERVICE,
  type BoardModulesServiceLike,
  BOARD_TASKS_SERVICE,
  type BoardTasksServiceLike,
  type BoardTaskPriority,
  BOARD_STATUSES_SERVICE,
  type BoardStatusesServiceLike,
  POKELO_CONTEXT_SERVICE,
  type PokeloContextServiceLike,
  type PokeloFetchOpts,
  AI_COMPOSE_LLM,
  type AiComposeLlmLike,
  INSTANCE_PLUGINS,
  type InstancePluginsLike,
  type InstancePluginScaffoldInput,
  PLUGIN_NAME_KEY,
} from './tokens';
export { loadVolumeNestModule } from './volume-nest';
