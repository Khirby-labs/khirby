import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SessionGuard } from '../../core/auth/session.guard';
import { PermissionGuard } from '../../core/rbac/rbac.guard';
import { RequirePermission } from '../../core/rbac/require-permission.decorator';
import { PluginRegistryService } from './plugin-registry.service';

@ApiTags('plugins')
@ApiBearerAuth('session')
@Controller('plugins')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('integrations', 'manage')
export class PluginsController {
  constructor(private readonly registry: PluginRegistryService) {}

  @Get()
  @ApiOperation({ summary: 'List plugins' })
  @ApiResponse({ status: 200, description: 'Plugin list' })
  findAll() {
    return this.registry.findAll();
  }

  @Get('installed/:name')
  @ApiOperation({
    summary:
      'Get plugin by name (crm_*); does not collide with GET /api/plugins/<slug> instance plugins',
  })
  @ApiResponse({ status: 200, description: 'Plugin' })
  findOne(@Param('name') name: string) {
    return this.registry.findByName(name);
  }

  @Post(':name/enable')
  @ApiOperation({ summary: 'Enable plugin' })
  @ApiResponse({ status: 200, description: 'Plugin enabled' })
  enable(@Param('name') name: string) {
    return this.registry.enable(name);
  }

  @Post(':name/disable')
  @ApiOperation({ summary: 'Disable plugin' })
  @ApiResponse({ status: 200, description: 'Plugin disabled' })
  disable(@Param('name') name: string) {
    return this.registry.disable(name);
  }

  @Delete('installed/:name')
  @ApiOperation({ summary: 'Uninstall plugin (not for image-native plugins)' })
  @ApiResponse({ status: 200, description: 'Plugin uninstalled' })
  uninstall(@Param('name') name: string) {
    return this.registry.uninstall(name);
  }

  @Patch(':name/config')
  @ApiOperation({ summary: 'Update configuration' })
  @ApiResponse({ status: 200, description: 'Configuration updated' })
  updateConfig(@Param('name') name: string, @Body() config: Record<string, string>) {
    return this.registry.updateConfig(name, config);
  }
}
