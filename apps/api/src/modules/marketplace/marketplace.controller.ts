import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator';
import { SessionGuard } from '../../core/auth/session.guard';
import { PermissionGuard } from '../../core/rbac/rbac.guard';
import { RequirePermission } from '../../core/rbac/require-permission.decorator';
import { MarketplaceService } from './marketplace.service';

class SubmitMarketplacePluginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(214)
  packageName!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  publisherName?: string;

  @IsOptional()
  @IsUrl()
  repositoryUrl?: string;
}

/**
 * The Marketplace catalog and its one-click install.
 *
 * No new permission resource: this rides `integrations:manage`, the same one
 * `PluginsController` uses. Installing a plugin and configuring one are the same
 * privilege, and inventing a second resource would let the two drift apart.
 *
 * `:name` may be a Control Plane slug or a `crm_*` identifier.
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
  @ApiResponse({ status: 404, description: 'Not in the catalog' })
  findOne(@Param('name') name: string) {
    return this.marketplace.findOne(name);
  }

  @Post('plugins/:name/install')
  @ApiOperation({ summary: 'Install a marketplace plugin (image or npm unpack)' })
  @ApiResponse({ status: 201, description: 'Installed — active in this process, no restart' })
  @ApiResponse({ status: 404, description: 'Not in the catalog' })
  @ApiResponse({ status: 409, description: 'Already installed' })
  install(@Param('name') name: string) {
    return this.marketplace.install(name);
  }

  @Post('plugins/:name/update')
  @ApiOperation({ summary: 'Upgrade an installed plugin to the latest approved npm version' })
  @ApiResponse({ status: 200, description: 'Upgraded in this process' })
  @ApiResponse({ status: 404, description: 'Not installed or not in the catalog' })
  update(@Param('name') name: string) {
    return this.marketplace.update(name);
  }

  @Post('submissions')
  @ApiOperation({ summary: 'Submit a plugin to the Control Plane marketplace' })
  @ApiResponse({ status: 201, description: 'Submitted' })
  @ApiResponse({ status: 400, description: 'Control Plane not configured or invalid body' })
  submit(@Body() dto: SubmitMarketplacePluginDto) {
    return this.marketplace.submit({
      slug: dto.slug,
      name: dto.name,
      description: dto.description,
      packageName: dto.packageName,
      publisherName: dto.publisherName,
      repositoryUrl: dto.repositoryUrl,
    });
  }
}
