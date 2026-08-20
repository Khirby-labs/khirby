import { HttpException, Inject, Injectable, Optional } from '@nestjs/common';
import {
  INSTANCE_PLUGINS,
  POKELO_CONTEXT_SERVICE,
  type InstancePluginsLike,
  type PokeloContextServiceLike,
} from '../../../../../../packages/plugin-host/src/tokens';
import { RbacService } from '../../../core/rbac/rbac.service';
import type { LlmToolDef } from '../agent-llm.client';
import type { ToolRunResult } from './crm-tools.adapter';

@Injectable()
export class PluginToolsAdapter {
  constructor(
    @Inject(INSTANCE_PLUGINS) private instancePlugins: InstancePluginsLike,
    private rbac: RbacService,
  ) {}

  definitions(): LlmToolDef[] {
    return [
      fn('list_installed_plugins', 'List plugins loaded in this process', {}),
      fn('describe_plugin_contract', 'Show instance plugin authoring contract', {}),
      fn(
        'scaffold_plugin',
        'Scaffold a new instance plugin directory and install it (defaults nest: true, install: true)',
        {
          directory: { type: 'string', description: 'One-segment folder under plugins/' },
          name: { type: 'string', description: 'crm_* plugin id' },
          displayName: { type: 'string', description: 'English UI title' },
          nest: {
            type: 'boolean',
            description: 'Include Nest module + sidebar route (default true)',
          },
          install: {
            type: 'boolean',
            description: 'Run install after scaffold (default true)',
          },
        },
        ['directory', 'name'],
      ),
      fn(
        'write_instance_plugin_file',
        'Patch ONE file in an existing scaffolded plugin — never create a plugin from scratch (use scaffold_plugin)',
        {
          directory: { type: 'string' },
          path: { type: 'string' },
          content: { type: 'string' },
        },
        ['directory', 'path', 'content'],
      ),
      fn(
        'read_instance_plugin_file',
        'Read a file from plugins/<dir>/',
        {
          directory: { type: 'string' },
          path: { type: 'string' },
        },
        ['directory', 'path'],
      ),
      fn(
        'list_instance_plugin_files',
        'List files in plugins/<dir>/',
        {
          directory: { type: 'string' },
        },
        ['directory'],
      ),
      fn(
        'remove_instance_plugin',
        'Delete plugins/<dir>/, manifest entry, and DB row (API restart clears in-memory code)',
        {
          directory: { type: 'string' },
        },
        ['directory'],
      ),
      fn(
        'install_instance_plugin',
        'validate → manifest → hotLoad (retries when already loaded)',
        {
          directory: { type: 'string' },
          packageName: {
            type: 'string',
            description: 'Optional; defaults to package.json name',
          },
        },
        ['directory'],
      ),
    ];
  }

  async run(userId: string, name: string, args: Record<string, unknown>): Promise<ToolRunResult> {
    if (!(await this.rbac.hasPermission(userId, 'integrations', 'manage'))) {
      return { ok: false, code: 'forbidden', summary: 'Forbidden' };
    }
    if (!(await this.rbac.hasPermission(userId, 'agent', 'use'))) {
      return { ok: false, code: 'forbidden', summary: 'Forbidden' };
    }

    try {
      switch (name) {
        case 'list_installed_plugins':
          return { ok: true, summary: this.instancePlugins.loadedNames().join(', ') || 'none' };
        case 'describe_plugin_contract':
          return { ok: true, summary: this.instancePlugins.pluginContract().slice(0, 500) };
        case 'scaffold_plugin': {
          const directory = String(args.directory);
          const out = this.instancePlugins.scaffold({
            directory,
            name: String(args.name),
            displayName: args.displayName ? String(args.displayName) : undefined,
            nest: args.nest === false ? false : true,
          });
          if (args.install === false) {
            return {
              ok: true,
              summary: `Scaffolded ${out.directory} (${out.files.length} files) — call install_instance_plugin when ready`,
            };
          }
          try {
            const result = await this.instancePlugins.installFromDirectory(directory);
            return {
              ok: true,
              summary: `Scaffolded and installed ${result.name} (${result.status}) — live in this API process`,
            };
          } catch (err) {
            return {
              ok: false,
              code: 'install_failed',
              summary: `Scaffolded ${out.files.length} files but install failed: ${formatToolError(err)}`,
            };
          }
        }
        case 'write_instance_plugin_file': {
          const directory = String(args.directory);
          const relPath = String(args.path);
          const existing = this.instancePlugins.listFiles(directory).files;
          if (!existing.includes('package.json') && relPath !== 'package.json') {
            return {
              ok: false,
              code: 'no_scaffold',
              summary:
                'Directory has no scaffold — call scaffold_plugin first; do not hand-create plugin entry files',
            };
          }
          const out = this.instancePlugins.writeFile(directory, relPath, String(args.content));
          const reloaded = await this.instancePlugins.reloadFromDirectory(directory);
          if (reloaded.status === 'reloaded') {
            return {
              ok: true,
              summary: `Wrote ${out.path} (${out.bytes} bytes) — live GET handler reloaded`,
            };
          }
          return {
            ok: true,
            summary: `Wrote ${out.path} (${out.bytes} bytes) — call install_instance_plugin when ready`,
          };
        }
        case 'read_instance_plugin_file': {
          const out = this.instancePlugins.readFile(String(args.directory), String(args.path));
          return { ok: true, summary: out.content.slice(0, 500) };
        }
        case 'list_instance_plugin_files': {
          const out = this.instancePlugins.listFiles(String(args.directory));
          return { ok: true, summary: out.files.join(', ') || 'empty' };
        }
        case 'remove_instance_plugin': {
          const removed = await this.instancePlugins.removeInstance(String(args.directory));
          return {
            ok: true,
            summary: `Removed ${removed.name} from disk and database (restart API to unload in-memory code)`,
          };
        }
        case 'install_instance_plugin': {
          const result = await this.instancePlugins.installFromDirectory(
            String(args.directory),
            args.packageName ? String(args.packageName) : undefined,
          );
          const note =
            result.status === 'already_active'
              ? 'already active in this API process'
              : 'live in this API process';
          return { ok: true, summary: `Installed ${result.name} (${result.status}) — ${note}` };
        }
        default:
          return { ok: false, code: 'unknown_tool', summary: 'Unknown tool' };
      }
    } catch (err) {
      return { ok: false, code: 'tool_error', summary: formatToolError(err) };
    }
  }
}

function formatToolError(err: unknown): string {
  if (err instanceof HttpException) {
    const resp = err.getResponse();
    if (typeof resp === 'object' && resp !== null && 'message' in resp) {
      const message = (resp as { message: unknown }).message;
      if (Array.isArray(message)) return message.join('; ');
      if (typeof message === 'string') return message;
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Tool failed';
}

@Injectable()
export class PokeloToolsAdapter {
  constructor(
    @Optional() @Inject(POKELO_CONTEXT_SERVICE) private pokelo: PokeloContextServiceLike | null,
    private rbac: RbacService,
  ) {}

  definitions(): LlmToolDef[] {
    if (!this.pokelo) return [];
    return [
      fn(
        'search_knowledge_base',
        'Search the organization Pokelo wiki for internal docs, runbooks, ADRs, and setup context. Call early and often for how-to, architecture, plugin, and process questions — before guessing.',
        {
          query: { type: 'string', description: 'Focused search query from the user question' },
        },
        ['query'],
      ),
    ];
  }

  async run(userId: string, name: string, args: Record<string, unknown>): Promise<ToolRunResult> {
    if (!this.pokelo) return { ok: false, code: 'unavailable', summary: 'Pokelo not configured' };
    if (!(await this.rbac.hasPermission(userId, 'agent', 'use'))) {
      return { ok: false, code: 'forbidden', summary: 'Forbidden' };
    }
    if (name !== 'search_knowledge_base') {
      return { ok: false, code: 'unknown_tool', summary: 'Unknown tool' };
    }
    const ctx = await this.pokelo.fetchContext(String(args.query ?? ''));
    return { ok: true, summary: ctx.slice(0, 800) || 'No results' };
  }
}

function fn(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
): LlmToolDef {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: { type: 'object', properties, required },
    },
  };
}
