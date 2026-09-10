import { Logger } from '@nestjs/common';
import { loadPlugins as loadImagePlugins } from './load-plugins.generated';
import {
  applyRootEnvFile,
  defaultInstancePluginsDir,
  loadInstancePlugins,
  preferLocalCheckoutPlugins,
} from './instance-plugins.loader';
import type { CrmPlugin } from '@khirby/plugin-sdk';

const bootLog = new Logger('Plugins');

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
  if (preferLocalCheckoutPlugins()) {
    bootLog.log('KHIRBY_PLUGINS_LOCAL=on — crm-plugin-* checkouts over Marketplace unpacks');
  }
  const image = loadImagePlugins();
  const instance = loadInstancePlugins(
    defaultInstancePluginsDir(),
    new Set(image.map((plugin) => plugin.name)),
    (msg) => bootLog.log(msg),
  );
  return [...image, ...instance];
}

export { loadImagePlugins };
