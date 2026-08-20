import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  PermissionGuard,
  RequirePermission,
  SessionGuard,
} from '../../../../../packages/plugin-host/src';
import { InstancePluginHttpBridge } from './instance-plugin-http.bridge';

/**
 * Single boot-time route for hot-loaded instance plugins (Fastify 5 blocks route()
 * after listen). Each plugin registers GET handlers on the bridge at hotLoad.
 */
@ApiTags('plugins')
@ApiBearerAuth('session')
@Controller()
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('integrations', 'manage')
export class InstancePluginHttpBridgeController {
  constructor(private readonly bridge: InstancePluginHttpBridge) {}

  @Get('plugins/:segment')
  dispatch(@Param('segment') segment: string) {
    return this.bridge.dispatch('GET', `plugins/${segment}`);
  }
}
