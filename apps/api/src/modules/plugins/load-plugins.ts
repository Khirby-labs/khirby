import { loadPlugins as loadImagePlugins } from './load-plugins.generated';
import { defaultInstancePluginsDir, loadInstancePlugins } from './instance-plugins.loader';
import type { CrmPlugin } from '@khirby/plugin-sdk';

/**
 * Image plugins (generated from plugins.manifest.json) plus packages in
 * `plugins/` that are not first-party (ADR-0036, ADR-0039). The returned array
 * is the `CRM_PLUGINS` value — it must stay the same reference so a later `push`
 * is visible to `emit()`. Volume Nest controllers are registered only at this
 * boot — not by LazyModuleLoader.
 */
export function loadPlugins(): CrmPlugin[] {
  const image = loadImagePlugins();
  const instance = loadInstancePlugins(
    defaultInstancePluginsDir(),
    new Set(image.map((plugin) => plugin.name)),
  );
  return [...image, ...instance];
}

export { loadImagePlugins };
