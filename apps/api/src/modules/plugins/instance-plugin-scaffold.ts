import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type InstancePluginScaffoldInput = {
  directory: string;
  name: string;
  displayName?: string;
  nest?: boolean;
};

/**
 * npm-shaped volume plugin. Bare host specifiers — the package is loaded by
 * jiti at runtime, not compiled into `apps/api/dist` (ADR-0036).
 *
 * Layout matches published plugins + https://khirby.com/docs/plugins/create:
 * ESM imports at file top, named class, `createPlugin()`, Nest in `src/nest-module.ts`.
 * Volume Nest is attached with `loadVolumeNestModule` (do not import `./nest-module` from index).
 * Nest templates gate on `integrations:manage` (there is no `plugins` resource).
 */
export function pluginRouteSlug(name: string): string {
  return name.replace(/^crm_/, '').replace(/_/g, '-');
}

/** crm_hello_world_stats → HelloWorldStatsPlugin */
export function pluginClassName(name: string): string {
  const stem = name.replace(/^crm_/, '');
  const pascal = stem
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
  return `${pascal || 'Instance'}Plugin`;
}

export function scaffoldFileMap(input: InstancePluginScaffoldInput): Record<string, string> {
  const displayName = input.displayName?.trim() || input.name;
  const routeSlug = pluginRouteSlug(input.name);
  const className = pluginClassName(input.name);

  const controllerName = className.replace(/Plugin$/, 'Controller');
  const nestModuleName = className.replace(/Plugin$/, 'NestModule');

  const nestModule = input.nest
    ? `import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import {
  SessionGuard,
  PermissionGuard,
  RequirePermission,
  RequirePluginEnabled,
  PluginEnabledGuard,
} from '@khirby/plugin-host';

/**
 * Host page (no Vue ./web): GET /api/plugins/${routeSlug} is rendered by
 * InstancePluginView as { stats: [{ label, value }], footer?: string }.
 * Extend with host tokens (DB_TOKEN, CONTACTS_SERVICE, …) and
 * https://khirby.com/docs/plugins/create — keep ESM imports at the top of this file.
 */
@Controller('plugins/${routeSlug}')
@UseGuards(SessionGuard, PermissionGuard, PluginEnabledGuard)
@RequirePluginEnabled('${input.name}')
@RequirePermission('integrations', 'manage')
export class ${controllerName} {
  @Get()
  index() {
    return { stats: [] as Array<{ label: string; value: number }>, footer: '' };
  }
}

@Module({ controllers: [${controllerName}] })
export class ${nestModuleName} {}
export { ${nestModuleName} as PluginNestModule };
`
    : '';

  const nestImport = input.nest
    ? `import type { CrmPlugin, PluginContext } from '@khirby/plugin-sdk';
import { loadVolumeNestModule } from '@khirby/plugin-host/volume-nest';
`
    : `import type { CrmPlugin, PluginContext } from '@khirby/plugin-sdk';
`;

  const nestMethods = input.nest
    ? `
  getNestModule() {
    // Volume only — do not import './nest-module' from this file (jiti).
    return loadVolumeNestModule(__dirname);
  }

  getFrontendRoutes() {
    return [
      {
        path: '/plugins/${routeSlug}',
        name: 'plugin-${routeSlug}',
        navLabel: ${JSON.stringify(displayName)},
        navIcon: 'plugins',
        showInNav: true,
      },
    ];
  }
`
    : '';

  const index = `${nestImport}
export class ${className} implements CrmPlugin {
  name = '${input.name}';
  displayName = ${JSON.stringify(displayName)};
  description = ${JSON.stringify(displayName)};
  version = '0.1.0';
${nestMethods}
  getConfigSchema() {
    return [];
  }

  onInit(ctx: PluginContext) {
    ctx.log(${JSON.stringify(`${displayName} ready`)});
  }
}

export function createPlugin(): CrmPlugin {
  return new ${className}();
}
`;

  const pkg = {
    name: input.directory,
    version: '0.1.0',
    private: true,
    keywords: ['khirby-plugin'],
    main: './src/index.ts',
    types: './src/index.ts',
    exports: { '.': './src/index.ts' },
    peerDependencies: {
      '@khirby/plugin-sdk': '*',
      '@khirby/plugin-host': '*',
      '@nestjs/common': '*',
      'drizzle-orm': '*',
    },
  };

  const files: Record<string, string> = {
    'package.json': `${JSON.stringify(pkg, null, 2)}\n`,
    'src/index.ts': index,
  };
  if (input.nest) {
    files['src/nest-module.ts'] = nestModule;
  }
  return files;
}

export function writeScaffold(root: string, input: InstancePluginScaffoldInput): string[] {
  const files = scaffoldFileMap(input);
  const written: string[] = [];
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
    written.push(rel);
  }
  return written;
}
