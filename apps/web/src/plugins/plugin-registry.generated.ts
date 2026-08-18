/** Generated — do not edit. Source: plugins.manifest.json */

export type GeneratedPluginWebEntry = {
  name: string;
  component: () => Promise<unknown>;
  children?: unknown[];
  messages?: { en?: Record<string, unknown>; pl?: Record<string, unknown> };
};
import { webEntry as webEntry_0 } from '@khirby/plugin-listmonk/web';
import { webEntry as webEntry_1 } from 'crm-plugin-hello/web';

const entries: GeneratedPluginWebEntry[] = [
  webEntry_0,
  webEntry_1,
];

export const generatedPluginWebEntries: Record<string, GeneratedPluginWebEntry> = Object.fromEntries(
  entries.map((e) => [e.name, e]),
);
