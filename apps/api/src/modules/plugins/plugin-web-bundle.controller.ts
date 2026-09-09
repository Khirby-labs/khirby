import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { SessionGuard } from '../../core/auth/session.guard';
import { PluginRegistryService } from './plugin-registry.service';

function mimeForWebFile(rel: string): string {
  if (rel.endsWith('.js') || rel.endsWith('.mjs')) {
    return 'application/javascript; charset=utf-8';
  }
  if (rel.endsWith('.css')) return 'text/css; charset=utf-8';
  if (rel.endsWith('.json') || rel.endsWith('.map')) {
    return 'application/json; charset=utf-8';
  }
  if (rel.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

/**
 * Serves volume plugin SPA bundles from `dist/web/` (ADR-0043).
 * Session cookie required; plugin must be installed. Path traversal is rejected.
 */
@ApiTags('plugins')
@ApiBearerAuth('session')
@Controller('plugins')
@UseGuards(SessionGuard)
export class PluginWebBundleController {
  constructor(private readonly registry: PluginRegistryService) {}

  // Fastify/find-my-way: wildcard must be a trailing `*` — Nest's `*path` is rejected
  // ("Wildcard must be the last character in the route"). Rel path comes from the URL.
  @Get(':name/web/*')
  @ApiOperation({ summary: 'Serve plugin web bundle file from volume dist/web/' })
  async serve(@Param('name') name: string, @Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const rel = extractWebRelPath(req.url ?? '').replace(/^\/+/, '');
    const file = rel || 'entry.js';
    const abs = await this.registry.resolveWebBundleFile(name, file);
    reply.header('Content-Type', mimeForWebFile(file));
    reply.header('Cache-Control', 'private, max-age=0, must-revalidate');
    return reply.send(this.registry.openWebBundleStream(abs));
  }
}

/** Path after `/web/` (query stripped), defaulting to entry.js. */
export function extractWebRelPath(url: string): string {
  const pathOnly = url.split('?')[0] ?? '';
  const marker = '/web/';
  const idx = pathOnly.lastIndexOf(marker);
  if (idx < 0) return 'entry.js';
  const raw = pathOnly.slice(idx + marker.length);
  if (!raw) return 'entry.js';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
