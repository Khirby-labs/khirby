import { HttpException, Injectable } from '@nestjs/common';
import { RbacService } from '../../../core/rbac/rbac.service';
import { MarketplaceCatalogService } from '../../marketplace/marketplace-catalog.service';
import { MarketplaceService } from '../../marketplace/marketplace.service';
import type { MarketplacePlugin } from '../../../../../../packages/types/src';
import type { LlmToolDef } from '../agent-llm.client';
import type { ToolRunResult } from './crm-tools.adapter';

/**
 * Agent surface for Marketplace discovery + install (same privilege as the SPA).
 * There is no update/upgrade tool — image-bound plugins; see system prompt.
 */
@Injectable()
export class MarketplaceToolsAdapter {
  constructor(
    private marketplace: MarketplaceService,
    private catalog: MarketplaceCatalogService,
    private rbac: RbacService,
  ) {}

  definitions(): LlmToolDef[] {
    return [
      fn(
        'list_marketplace_plugins',
        'List Marketplace plugins in this image. Split into: (1) catalog/published entries with available|installed, (2) installed-but-NOT-in-catalog (instance/local — not published). Includes inCatalog, versions, catalogNewer. Does not update plugins.',
        {},
      ),
      fn(
        'install_marketplace_plugin',
        'Install a catalog plugin that is present in this image but not yet installed (crm_* name from list_marketplace_plugins). Not an upgrade — use only for status=available.',
        {
          name: {
            type: 'string',
            description: 'Plugin crm_* name from list_marketplace_plugins',
          },
        },
        ['name'],
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
        case 'list_marketplace_plugins':
          return await this.list();
        case 'install_marketplace_plugin':
          return await this.install(String(args.name ?? ''));
        default:
          return { ok: false, code: 'unknown_tool', summary: `Unknown tool: ${name}` };
      }
    } catch (err) {
      return mapError(err);
    }
  }

  private async list(): Promise<ToolRunResult> {
    const [cards, document] = await Promise.all([this.marketplace.list(), this.catalog.load()]);
    const catalogByName = new Map(
      document.entries.map((entry) => [entry.name, entry.version] as const),
    );
    if (cards.length === 0) {
      return { ok: true, summary: 'No Marketplace plugins in this image.' };
    }

    const listed = cards.filter((card) => catalogByName.has(card.name));
    const unlisted = cards.filter((card) => !catalogByName.has(card.name));

    const sections: string[] = [];
    sections.push(
      `${listed.length} catalog plugin(s) (published in Marketplace catalog):` +
        (listed.length
          ? `\n${listed.map((card) => formatCard(card, catalogByName.get(card.name), true)).join('\n')}`
          : '\n(none)'),
    );
    if (unlisted.length > 0) {
      sections.push(
        `${unlisted.length} installed outside catalog (NOT published in Marketplace — e.g. instance/local plugins):` +
          `\n${unlisted.map((card) => formatCard(card, undefined, false)).join('\n')}`,
      );
    }

    return {
      ok: true,
      summary: sections.join('\n\n'),
    };
  }

  private async install(pluginName: string): Promise<ToolRunResult> {
    const trimmed = pluginName.trim();
    if (!trimmed) {
      return { ok: false, code: 'invalid_args', summary: 'name is required' };
    }
    const installed = await this.marketplace.install(trimmed);
    return {
      ok: true,
      summary: `Installed ${installed.name} v${installed.version} (enabled=${installed.enabled}). Configure in Settings → Integrations if needed.`,
    };
  }
}

function formatCard(
  card: MarketplacePlugin,
  catalogVersion: string | undefined,
  inCatalog: boolean,
): string {
  const catalog = inCatalog ? (catalogVersion ?? card.version) : 'none';
  const catalogNewer =
    inCatalog && card.status === 'installed' && isNewerVersion(catalog, card.version)
      ? 'yes'
      : 'no';
  const parts = [
    card.name,
    `inCatalog=${inCatalog ? 'yes' : 'no'}`,
    `status=${card.status}`,
    `version=${card.version}`,
    `catalogVersion=${catalog}`,
    `catalogNewer=${catalogNewer}`,
    `displayName=${card.displayName}`,
    `category=${card.category}`,
  ];
  if (card.status === 'installed') {
    parts.push(`enabled=${card.enabled}`);
  }
  if (card.description) {
    parts.push(`description=${card.description.replace(/\s+/g, ' ').slice(0, 120)}`);
  }
  return parts.join(' | ');
}

/** Naive dotted numeric compare; non-numeric segments compare as strings. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = splitVersion(candidate);
  const b = splitVersion(current);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const left = a[i] ?? '0';
    const right = b[i] ?? '0';
    const leftNum = Number(left);
    const rightNum = Number(right);
    if (Number.isFinite(leftNum) && Number.isFinite(rightNum)) {
      if (leftNum !== rightNum) return leftNum > rightNum;
      continue;
    }
    if (left !== right) return left > right;
  }
  return false;
}

function splitVersion(version: string): string[] {
  return version.trim().replace(/^v/i, '').split(/[.+-]/).filter(Boolean);
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

function mapError(err: unknown): ToolRunResult {
  if (err instanceof HttpException) {
    const status = err.getStatus();
    const body = err.getResponse();
    const summary =
      typeof body === 'string'
        ? body
        : typeof body === 'object' && body && 'message' in body
          ? String((body as { message: unknown }).message)
          : err.message;
    if (status === 404) return { ok: false, code: 'not_found', summary };
    if (status === 409) return { ok: false, code: 'conflict', summary };
    return { ok: false, code: 'http_error', summary };
  }
  return {
    ok: false,
    code: 'error',
    summary: err instanceof Error ? err.message : String(err),
  };
}
