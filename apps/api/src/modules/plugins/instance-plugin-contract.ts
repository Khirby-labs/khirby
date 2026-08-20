/**
 * Shared contract text for instance-plugin authoring (ADR-0038).
 * MCP tools and in-app chat both return this — do not fork a second copy
 * inside @khirby/plugin-mcp.
 */
export const INSTANCE_PLUGIN_CONTRACT = `Khirby instance plugin contract (self-build).

Clients: MCP (Cursor/Claude) and in-app chat. Do not route codegen through AI Compose.

Events the host emits (CrmEvent.type):
- contact.created
- form.submitted
- lead.created
- lead.moved
- lead.deleted
- email.received
- email.sent

Package shape:
- package.json with exports["."] (or main) resolving to a module that exports createPlugin(): CrmPlugin
- Import @khirby/plugin-sdk and @khirby/plugin-host with bare specifiers (never relative packages/plugin-host/src)
- Nest controllers live in src/nest-module.ts; index.ts lazy-loads them via ts-node (scaffold default)
- Optional getNestModule(), getConfigSchema(), onEvent, onInit, onMigrate

Instance volume:
- Files live under plugins/<one-segment>/ (same folder as first-party plugins; INSTANCE_PLUGINS_DIR overrides)
- Prefer directory names like crm-plugin-demo — never crm-plugin-mcp / webhook / discord / listmonk / ai-compose / pokelo
- Host methods write/read/list fill and inspect that directory
- install / hotLoad is append-only for Nest modules (they stay in the container). After write_instance_plugin_file or a repeat install_instance_plugin, the host re-jiti's the package and rebinds GET handlers on InstancePluginHttpBridge — no API restart for page copy/stats changes.
- install_instance_plugin is safe to retry when already loaded (reloads live GET); remove_instance_plugin deletes the volume dir + DB row (restart API to drop in-memory Nest modules).
- Uninstall (UI or DELETE /api/plugins/installed/:name) runs onUninstall when defined, then drops the row. Native image plugins cannot be uninstalled.
- scaffold with nest: true (default) for sidebar pages; validation requires getNestModule + getFrontendRoutes + navLabel together.

Do not:
- Set exports["./web"] or web: true — Vue is not hot-loadable; install returns 400 web_not_hot_loadable
- Reuse native names (crm_webhook, crm_discord, crm_listmonk, crm_mcp, crm_ai_compose, crm_pokelo) or crm_hello
- Use .. or nested paths for the directory
- Unload / replace a plugin already in the image

Marketplace listing and npm publish are a separate ticket.
`;
