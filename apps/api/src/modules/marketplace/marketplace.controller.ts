import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SessionGuard } from '../../core/auth/session.guard';
import { PermissionGuard } from '../../core/rbac/rbac.guard';
import { RequirePermission } from '../../core/rbac/require-permission.decorator';
import { MarketplaceService } from './marketplace.service';

/**
 * The Marketplace catalog and its one-click install.
 *
 * No new permission resource: this rides `integrations:manage`, the same one
 * `PluginsController` uses. Installing a plugin and configuring one are the same
 * privilege, and inventing a second resource would let the two drift apart.
 *
 * Every `:name` is the plugin's `crm_*` identifier, never the catalog's `package`
 * field — the two are different strings and only one of them the registry knows.
 */
@ApiTags('marketplace')
@ApiBearerAuth('session')
@Controller('marketplace')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('integrations', 'manage')
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get('plugins')
  @ApiOperation({ summary: 'Catalog entries with their installation status' })
  @ApiResponse({ status: 200, description: 'Marketplace listing' })
  list() {
    return this.marketplace.list();
  }

  @Get('plugins/:name')
  @ApiOperation({ summary: 'One catalog entry' })
  @ApiResponse({ status: 200, description: 'Marketplace entry' })
  @ApiResponse({ status: 404, description: 'Not in the catalog, or not in this image' })
  findOne(@Param('name') name: string) {
    return this.marketplace.findOne(name);
  }

  @Post('plugins/:name/install')
  @ApiOperation({ summary: 'Install a plugin present in this image' })
  @ApiResponse({ status: 201, description: 'Installed — active in this process, no restart' })
  @ApiResponse({ status: 404, description: 'Not in the catalog, or not in this image' })
  @ApiResponse({ status: 409, description: 'Already installed' })
  install(@Param('name') name: string) {
    return this.marketplace.install(name);
  }
}
