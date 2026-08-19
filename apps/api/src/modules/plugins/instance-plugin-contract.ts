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
- Optional getNestModule(), getConfigSchema(), onEvent, onInit, onMigrate

Instance volume:
- Files live under plugins/<one-segment>/ (same folder as first-party plugins; INSTANCE_PLUGINS_DIR overrides)
- Prefer directory names like crm-plugin-demo — never crm-plugin-mcp / webhook / discord / listmonk / ai-compose / pokelo
- Host methods write/read/list fill and inspect that directory
- install / hotLoad is append-only. Restart scans plugins/ (and instance.manifest.json). An already-loaded name needs an API restart to pick up Nest module changes.

Do not:
- Set exports["./web"] or web: true — Vue is not hot-loadable; install returns 400 web_not_hot_loadable
- Reuse native names (crm_webhook, crm_discord, crm_listmonk, crm_mcp, crm_ai_compose, crm_pokelo) or crm_hello
- Use .. or nested paths for the directory
- Unload / replace a plugin already in the image

Marketplace listing and npm publish are a separate ticket.
`;
