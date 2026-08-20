/** Generated — do not edit. Source: plugins.manifest.json */
import type { CrmPlugin } from '@khirby/plugin-sdk';
import { createPlugin as createPlugin_0 } from '../../../../../plugins/crm-plugin-webhook/src';
import { createPlugin as createPlugin_1 } from '../../../../../plugins/crm-plugin-discord/src';
import { createPlugin as createPlugin_2 } from '../../../../../plugins/crm-plugin-listmonk/src';
import { createPlugin as createPlugin_3 } from '../../../../../plugins/crm-plugin-mcp/src';
import { createPlugin as createPlugin_4 } from '../../../../../plugins/crm-plugin-ai-compose/src';
import { createPlugin as createPlugin_5 } from '../../../../../plugins/crm-plugin-pokelo/src';

export function loadPlugins(): CrmPlugin[] {
  return [
    createPlugin_0(),
    createPlugin_1(),
    createPlugin_2(),
    createPlugin_3(),
    createPlugin_4(),
    createPlugin_5(),
  ];
}
