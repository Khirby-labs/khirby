import { loadPlugins as loadImagePlugins } from './load-plugins.generated';
import {
  applyRootEnvFile,
  defaultInstancePluginsDir,
  loadInstancePlugins,
} from './instance-plugins.loader';
import type { CrmPlugin } from '@khirby/plugin-sdk';

/**
 * Image plugins (generated from plugins.manifest.json) plus packages in
 * `plugins/` that are not first-party (ADR-0036, ADR-0039). The returned array
 * is the `CRM_PLUGINS` value — it must stay the same reference so a later `push`
 * is visible to `emit()`. Volume Nest controllers bind on InstancePluginHttpBridge
 * (boot + hotLoad + reload) — they are not imported into PluginsModule.forRoot.
 *
 * `KHIRBY_PLUGINS_LOCAL` (ADR-0045) prefers `crm-plugin-*` checkouts over
 * Marketplace unpacks. Applied here because this runs before ConfigModule.
 */
export function loadPlugins(): CrmPlugin[] {
  applyRootEnvFile();
  const image = loadImagePlugins();
  const instance = loadInstancePlugins(
    defaultInstancePluginsDir(),
    new Set(image.map((plugin) => plugin.name)),
  );
  return [...image, ...instance];
}

export { loadImagePlugins };
