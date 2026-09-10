import { All, Controller, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import {
  PermissionGuard,
  RequirePermission,
  SessionGuard,
} from '../../../../../packages/plugin-host/src';
import { InstancePluginHttpBridge } from './instance-plugin-http.bridge';

/**
 * Boot-time catch-all for hot-loaded / volume plugin Nest controllers.
 * Fastify 5 blocks route() after listen — LazyModuleLoader alone leaves no
 * Fastify route (INCIDENTS 2026-08-18), so plugins register on the bridge and
 * this dispatcher forwards by method + path.
 *
 * Wildcard must be trailing `*` (same Fastify/find-my-way rule as web bundles).
 * More-specific routes on PluginsController / PluginWebBundleController
 * (`installed/:name`, `:name/enable`, `:name/web/*`, …) stay preferred.
 */
@ApiTags('plugins')
@ApiBearerAuth('session')
@Controller('plugins')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('integrations', 'manage')
export class InstancePluginHttpBridgeController {
  constructor(private readonly bridge: InstancePluginHttpBridge) {}

  @All('*')
  dispatch(@Req() req: FastifyRequest) {
    return this.bridge.dispatchRequest(req);
  }
}
