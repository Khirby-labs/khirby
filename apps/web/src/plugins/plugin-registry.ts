/**
 * Plugin frontend registry — mapuje plugin.name → Vue komponent.
 *
 * Backend getFrontendRoutes() returns metadata (path, navLabel, navIcon).
 * Components come from:
 *   1. generatedPluginWebEntries (packages with exports["./web"], ADR-0016)
 *   2. legacy first-party map below (until those plugins ship ./web)
 *
 * pluginSettingsPanels: custom settings UIs embedded in Settings → Plugins
 * (ADR-0023) — not registered as sidebar routes.
 *
 * mailComposeAssistants: ADR-0017 — plugins register compose assist components
 * that render above the reply textarea in MailThreadPanel.
 */
import type { RouteRecordRaw } from 'vue-router';
import { generatedPluginWebEntries } from './plugin-registry.generated';

/** Legacy first-party plugins still mounting ops UI via getFrontendRoutes (none today). */
const legacyComponentMap: Record<string, () => Promise<unknown>> = {};

/**
 * First-party plugins whose settings are too interactive for PluginConfigForm
 * (tokens, encrypted keys, remote pickers). Mounted inside the Plugins list
 * expand panel — not as sidebar pages (ADR-0023).
 */
export const pluginSettingsPanels: Record<string, () => Promise<unknown>> = {
  crm_mcp: () => import('../components/plugins/McpSettingsPanel.vue'),
  crm_ai_compose: () => import('../components/plugins/AiComposeSettingsPanel.vue'),
  crm_pokelo: () => import('../components/plugins/PokeloSettingsPanel.vue'),
};

const legacyChildRoutes: Record<string, RouteRecordRaw[]> = {};

const generatedComponents: Record<string, () => Promise<unknown>> = {};
const generatedChildren: Record<string, RouteRecordRaw[]> = {};

for (const [name, entry] of Object.entries(generatedPluginWebEntries)) {
  generatedComponents[name] = entry.component;
  if (entry.children?.length) {
    generatedChildren[name] = entry.children as RouteRecordRaw[];
  }
}

/** Generated ./web entries override legacy for the same plugin name. */
export const pluginComponentMap: Record<string, () => Promise<unknown>> = {
  ...legacyComponentMap,
  ...generatedComponents,
};

export const pluginChildRoutes: Record<string, RouteRecordRaw[]> = {
  ...legacyChildRoutes,
  ...generatedChildren,
};

export { generatedPluginWebEntries };

/**
 * ADR-0017: Mail compose assistant slot.
 * Plugins register here to render an assist component above the compose/reply textarea.
 * Each component receives { threadId?, leadId?, onSuggest } props.
 */
export const mailComposeAssistants: Record<string, () => Promise<unknown>> = {
  crm_ai_compose: () => import('../components/mail/AiSuggestButton.vue'),
};
