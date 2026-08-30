import type { PluginWebEntry } from '@khirby/plugin-sdk';
import HelloView from './HelloView.vue';

export const webEntry: PluginWebEntry = {
  name: 'crm_hello',
  component: () => Promise.resolve(HelloView),
};
