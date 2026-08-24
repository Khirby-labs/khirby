/**
 * Shared contract text for instance-plugin authoring (ADR-0038).
 * MCP tools and in-app chat both return this — do not fork a second copy
 * inside @khirby/plugin-mcp.
 */
export const INSTANCE_PLUGIN_CONTRACT = `Khirby instance plugin contract (self-build).

Clients: MCP (Cursor/Claude) and in-app chat. Do not route codegen through AI Compose.

Public authoring guide (CrmPlugin, Nest, events, config, host tokens — follow it):
- https://khirby.com/docs/plugins/create
- https://khirby.com/docs/plugins/events
- https://khirby.com/docs/plugins/host  (Host API tokens)
- https://khirby.com/docs/plugins/self-build  (volume, no Vue, hot-load)
- https://khirby.com/docs/plugins/marketplace
- https://khirby.com/docs/plugins/

Start from scaffold_plugin. The skeleton matches published plugins
(examples/crm-plugin-hello, @khirby/plugin-webhook): ESM imports at the top of
each file, a named CrmPlugin class, createPlugin(), Nest in src/nest-module.ts.
Extend those files — do not replace the layout with require(), ts-node,
createRequire, or a GeneratedPlugin class.

Layout (nest: true, the default):
  package.json
  src/index.ts         — CrmPlugin class + createPlugin(); getNestModule() calls
                         loadVolumeNestModule(__dirname) from
                         @khirby/plugin-host/volume-nest
  src/nest-module.ts   — @Controller / @Module; ESM import @khirby/plugin-host
                         at top; export PluginNestModule (or *NestModule)

How to author:
1. describe_plugin_contract (this text) then scaffold_plugin.
2. Read the scaffolded files. Keep export function createPlugin.
3. Implement the user's intent in those files (stats, events, config, extra
   routes) using the public guide. Inject host tokens from @khirby/plugin-host
   (DB_TOKEN, CONTACTS_SERVICE, LEADS_SERVICE, SessionGuard, PermissionGuard, …)
   — never apps/api.
4. write_instance_plugin_file one file at a time. ESM import at file top only.
5. install_instance_plugin if scaffold did not already install.

Instance-volume exceptions (supersede the Vue / Nest-return sections of the
public guide):
- Bare @khirby/plugin-sdk and @khirby/plugin-host (never relative
  packages/plugin-host/src).
- Do not import './nest-module' from src/index.ts — jiti cannot evaluate Nest
  method decorators. Keep getNestModule() as loadVolumeNestModule(__dirname).
  Published npm packages import the Nest class instead; that is not this path.
- Do not set exports["./web"] — Vue is not hot-loadable (400 web_not_hot_loadable).
- Without ./web the SPA uses InstancePluginView: heading = displayName, body from
  GET /api{route.path} as { stats: [{ label: string, value: number }, ...], footer?: string }.
  Empty stats/footer is a valid starting point; fill from user intent.
- Canonical SPA path /plugins/<slug> where slug = name without crm_ and with _ → -
  (crm_hello_stats → /plugins/hello-stats). Must match @Controller('plugins/<slug>').
  Directory name is independent — never build the URL from the folder.
- Nest permission resource is integrations:manage (the public guide's
  plugins:manage is wrong for this host — there is no plugins resource).
- Host write/read/list/install accept the volume folder, the crm_* name, or the SPA
  slug. The path /plugins/… is not a directory.
- After write or a repeat install, the host reloads the package and rebinds GET
  handlers — no API restart, no Marketplace publish.

Events the host emits (CrmEvent.type) — payloads: https://khirby.com/docs/plugins/events
- contact.created, form.submitted, lead.created, lead.moved, lead.deleted,
  email.received, email.sent

Do not:
- require() / ts-node.register / createRequire in plugin source — the host loads
  TypeScript; files use ESM import at the top
- Reuse native names (crm_webhook, crm_discord, crm_listmonk, crm_mcp,
  crm_ai_compose, crm_pokelo) or crm_hello; reserved dirs crm-plugin-mcp / webhook /
  discord / listmonk / ai-compose / pokelo
- Use .. or nested paths for the directory
- Unload / replace a plugin already in the image
`;
