import { SetMetadata } from '@nestjs/common';
import { PLUGIN_NAME_KEY } from './tokens';

/** Attach the CrmPlugin.name this controller belongs to (for PluginEnabledGuard). */
export const RequirePluginEnabled = (pluginName: string) =>
  SetMetadata(PLUGIN_NAME_KEY, pluginName);
