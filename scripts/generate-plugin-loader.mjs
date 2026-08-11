#!/usr/bin/env node
/** Generate load-plugins.generated.ts + plugin-registry.generated.ts from plugins.manifest.json. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const manifestPath = join(root, 'plugins.manifest.json');
const apiGenDir = join(root, 'apps/api/src/modules/plugins');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const plugins = manifest.plugins;
if (!Array.isArray(plugins)) {
  console.error('Invalid plugins.manifest.json');
  process.exit(1);
}

const PACKAGE_TO_DIR = {
  '@khirby/plugin-webhook': 'crm-plugin-webhook',
  '@khirby/plugin-discord': 'crm-plugin-discord',
  '@khirby/plugin-listmonk': 'crm-plugin-listmonk',
  '@khirby/plugin-mcp': 'crm-plugin-mcp',
  '@khirby/plugin-ai-compose': 'crm-plugin-ai-compose',
  '@khirby/plugin-pokelo': 'crm-plugin-pokelo',
};

function workspacePluginDir(packageName) {
  const mapped = PACKAGE_TO_DIR[packageName];
  if (mapped) {
    const dir = join(root, 'plugins', mapped);
    if (existsSync(join(dir, 'package.json'))) return dir;
  }
  const candidates = [
    join(root, 'plugins', packageName),
    join(root, 'plugins', packageName.replace(/^@khirby\//, '').replace(/^@crm\//, 'crm-')),
    join(
      root,
      'plugins',
      `crm-plugin-${packageName.replace(/^@khirby\/plugin-/, '').replace(/^@crm\/plugin-/, '')}`,
    ),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'package.json'))) return c;
  }
  return null;
}

function importSpecifier(packageName) {
  const dir = workspacePluginDir(packageName);
  if (dir) {
    const target = join(dir, 'src');
    let rel = relative(apiGenDir, target).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return rel;
  }
  return packageName;
}

function packageHasWebExport(packageName) {
  const dir = workspacePluginDir(packageName);
  const candidates = [
    dir ? join(dir, 'package.json') : null,
    join(root, 'apps/api/node_modules', ...packageName.split('/'), 'package.json'),
    join(root, 'node_modules', ...packageName.split('/'), 'package.json'),
  ].filter(Boolean);
  for (const pkgPath of candidates) {
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (pkg.exports?.['./web']) return true;
  }
  return false;
}

const apiImports = plugins
  .map(
    (p, i) => `import { createPlugin as createPlugin_${i} } from '${importSpecifier(p.package)}';`,
  )
  .join('\n');
const apiReturns = plugins.map((_, i) => `    createPlugin_${i}(),`).join('\n');

const apiOut = `/** Generated — do not edit. Source: plugins.manifest.json */
import type { CrmPlugin } from '@khirby/plugin-sdk';
${apiImports}

export function loadPlugins(): CrmPlugin[] {
  return [
${apiReturns}
  ];
}
`;

const apiTarget = join(apiGenDir, 'load-plugins.generated.ts');
if (existsSync(apiGenDir)) {
  writeFileSync(apiTarget, apiOut);
  console.log(`Wrote ${apiTarget}`);
} else {
  console.log(`Skipped API loader (${apiGenDir} not present)`);
}

const webEntries = plugins.filter((p) => packageHasWebExport(p.package));

const webOut = `/** Generated — do not edit. Source: plugins.manifest.json */

export type GeneratedPluginWebEntry = {
  name: string;
  component: () => Promise<unknown>;
  children?: unknown[];
  messages?: { en?: Record<string, unknown>; pl?: Record<string, unknown> };
};
${webEntries
  .map((p, i) => `import { webEntry as webEntry_${i} } from '${p.package}/web';`)
  .join('\n')}

const entries: GeneratedPluginWebEntry[] = [
${webEntries.map((_, i) => `  webEntry_${i},`).join('\n')}
];

export const generatedPluginWebEntries: Record<string, GeneratedPluginWebEntry> = Object.fromEntries(
  entries.map((e) => [e.name, e]),
);
`;

const webGenDir = join(root, 'apps/web/src/plugins');
const webTarget = join(webGenDir, 'plugin-registry.generated.ts');
if (existsSync(join(root, 'apps/web'))) {
  mkdirSync(webGenDir, { recursive: true });
  writeFileSync(webTarget, webOut);
  console.log(`Wrote ${webTarget} (${webEntries.length} web entries)`);
} else {
  console.log(`Skipped web registry (apps/web not present)`);
}
