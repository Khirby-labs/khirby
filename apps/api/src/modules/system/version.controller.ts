import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AppVersionInfo } from '../../../../../packages/types/src';
import { SessionGuard } from '../../core/auth/session.guard';
import { VersionService } from './version.service';

/**
 * Authenticated about/version surface for Settings. Not on `/api/health` —
 * that endpoint stays minimal for probes (no version leakage).
 */
@ApiTags('system')
@ApiBearerAuth('session')
@Controller('system')
@UseGuards(SessionGuard)
export class VersionController {
  constructor(private readonly versions: VersionService) {}

  @Get('version')
  @ApiOperation({ summary: 'Running build version and latest GitHub Release' })
  @ApiResponse({ status: 200, description: 'Version comparison' })
  @ApiResponse({ status: 401, description: 'No session' })
  getVersion(): Promise<AppVersionInfo> {
    return this.versions.getVersionInfo();
  }
}
