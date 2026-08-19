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
export function scaffoldFileMap(input: InstancePluginScaffoldInput): Record<string, string> {
  const displayName = input.displayName?.trim() || input.name;
  const nestBlock = input.nest
    ? `
import { Module, Controller, Get, UseGuards } from '@nestjs/common';
import {
  SessionGuard,
  PermissionGuard,
  RequirePermission,
  RequirePluginEnabled,
  PluginEnabledGuard,
} from '@khirby/plugin-host';

@Controller('plugins/${input.name.replace(/^crm_/, '')}')
@UseGuards(SessionGuard, PermissionGuard, PluginEnabledGuard)
@RequirePluginEnabled('${input.name}')
@RequirePermission('integrations', 'manage')
class PluginController {
  @Get()
  ping() {
    return { ok: true, plugin: '${input.name}' };
  }
}

@Module({ controllers: [PluginController] })
class PluginNestModule {}
`
    : '';

  const nestMethods = input.nest
    ? `
  getNestModule() {
    return PluginNestModule;
  }
`
    : '';

  const index = `import type { CrmPlugin, CrmEvent, PluginContext } from '@khirby/plugin-sdk';
${nestBlock}
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
    },
  };

  return {
    'package.json': `${JSON.stringify(pkg, null, 2)}\n`,
    'src/index.ts': index,
  };
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
