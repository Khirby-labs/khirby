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
 * jiti at runtime, not compiled into apps/api/dist (ADR-0036).
 *
 * Nest templates gate on `integrations:manage` (there is no `plugins` resource).
 */
export function pluginRouteSlug(name: string): string {
  return name.replace(/^crm_/, '').replace(/_/g, '-');
}

export function scaffoldFileMap(input: InstancePluginScaffoldInput): Record<string, string> {
  const displayName = input.displayName?.trim() || input.name;
  const routeSlug = pluginRouteSlug(input.name);

  const nestModule = input.nest
    ? `import 'reflect-metadata';
import { Controller, Get, Inject, Injectable, Module, UseGuards } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import {
  SessionGuard,
  PermissionGuard,
  RequirePermission,
  RequirePluginEnabled,
  PluginEnabledGuard,
  DB_TOKEN,
} from '@khirby/plugin-host';

@Injectable()
export class PluginStatsService {
  constructor(@Inject(DB_TOKEN) private readonly db: { execute: (q: unknown) => Promise<unknown> }) {}

  private async count(table: string): Promise<number> {
    const rows = (await this.db.execute(sql.raw(\`select count(*)::int as c from \${table}\`))) as Array<{ c: number }>;
    return rows[0]?.c ?? 0;
  }

  async stats() {
    const [leads, users, contacts] = await Promise.all([
      this.count('leads'),
      this.count('users'),
      this.count('contacts'),
    ]);
    return {
      stats: [
        { label: 'Leady', value: leads },
        { label: 'Użytkownicy', value: users },
        { label: 'Kontakty', value: contacts },
      ],
      footer: '',
    };
  }
}

@Controller('plugins/${routeSlug}')
@UseGuards(SessionGuard, PermissionGuard, PluginEnabledGuard)
@RequirePluginEnabled('${input.name}')
@RequirePermission('integrations', 'manage')
export class PluginController {
  constructor(private readonly stats: PluginStatsService) {}

  @Get()
  index() {
    return this.stats.stats();
  }
}

@Module({ controllers: [PluginController], providers: [PluginStatsService] })
export class PluginNestModule {}
`
    : '';

  const nestMethods = input.nest
    ? `
  getNestModule() {
    require('reflect-metadata');
    require('ts-node').register({
      transpileOnly: true,
      compilerOptions: {
        module: 'commonjs',
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        esModuleInterop: true,
      },
    });
    const path = require('path');
    const { createRequire } = require('module');
    const pkgRoot = path.join(__dirname, '..');
    const nativeRequire = createRequire(path.join(pkgRoot, 'package.json'));
    return nativeRequire('./src/nest-module.ts').PluginNestModule;
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

  const index = `import type { CrmPlugin, CrmEvent, PluginContext } from '@khirby/plugin-sdk';

export class GeneratedPlugin implements CrmPlugin {
  name = '${input.name}';
  displayName = ${JSON.stringify(displayName)};
  version = '0.1.0';
${nestMethods}
  getConfigSchema() {
    return [];
  }

  onInit(ctx: PluginContext) {
    ctx.log('${input.name} ready');
  }

  async onEvent(event: CrmEvent, ctx: PluginContext) {
    if (event.type === 'contact.created') {
      ctx.log(\`contact.created \${event.payload.email}\`);
    }
  }
}

export function createPlugin(): CrmPlugin {
  return new GeneratedPlugin();
}
`;

  const pkg = {
    name: input.directory,
    version: '0.1.0',
    private: true,
    main: './src/index.ts',
    types: './src/index.ts',
    exports: { '.': './src/index.ts' },
    peerDependencies: {
      '@khirby/plugin-sdk': '*',
      '@khirby/plugin-host': '*',
      '@nestjs/common': '*',
      'drizzle-orm': '*',
      'ts-node': '*',
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
