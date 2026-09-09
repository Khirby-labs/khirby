/** Generated — do not edit. Source: plugins.manifest.json */

export type GeneratedPluginWebEntry = {
  name: string;
  component: () => Promise<unknown>;
  children?: unknown[];
  messages?: { en?: Record<string, unknown>; pl?: Record<string, unknown> };
};


const entries: GeneratedPluginWebEntry[] = [

];

export const generatedPluginWebEntries: Record<string, GeneratedPluginWebEntry> = Object.fromEntries(
  entries.map((e) => [e.name, e]),
);
