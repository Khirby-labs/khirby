import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
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
  @ApiOperation({ summary: 'Lista pluginów' })
  @ApiResponse({ status: 200, description: 'Lista pluginów' })
  findAll() { return this.registry.findAll(); }

  @Get(':name')
  @ApiOperation({ summary: 'Plugin po nazwie' })
  @ApiResponse({ status: 200, description: 'Plugin' })
  findOne(@Param('name') name: string) { return this.registry.findByName(name); }

  @Post(':name/enable')
  @ApiOperation({ summary: 'Włącz plugin' })
  @ApiResponse({ status: 200, description: 'Plugin włączony' })
  enable(@Param('name') name: string) { return this.registry.enable(name); }

  @Post(':name/disable')
  @ApiOperation({ summary: 'Wyłącz plugin' })
  @ApiResponse({ status: 200, description: 'Plugin wyłączony' })
  disable(@Param('name') name: string) { return this.registry.disable(name); }

  @Patch(':name/config')
  @ApiOperation({ summary: 'Zaktualizuj konfigurację' })
  @ApiResponse({ status: 200, description: 'Konfiguracja zaktualizowana' })
  updateConfig(@Param('name') name: string, @Body() config: Record<string, string>) {
    return this.registry.updateConfig(name, config);
  }
}
