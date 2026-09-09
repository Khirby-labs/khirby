import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';
import { SessionGuard } from '../../core/auth/session.guard';
import { PermissionGuard } from '../../core/rbac/rbac.guard';
import { RequirePermission } from '../../core/rbac/require-permission.decorator';
import { AppException } from '../../core/errors/app-exception';
import { ControlPlaneClient } from './control-plane.client';
import { InstallationIdentityService } from './installation-identity.service';
import { TelemetryService } from './telemetry.service';

class RegisterControlPlaneDto {
  @IsEmail()
  email!: string;
}

@ApiTags('system')
@ApiBearerAuth('session')
@Controller('system/control-plane')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('integrations', 'manage')
export class ControlPlaneController {
  constructor(
    private readonly client: ControlPlaneClient,
    private readonly identity: InstallationIdentityService,
    private readonly telemetry: TelemetryService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Control Plane connection and registration status' })
  @ApiResponse({ status: 200, description: 'Status snapshot' })
  async status() {
    const row = await this.identity.getOrCreate();
    return {
      controlPlaneUrlConfigured: this.client.isConfigured(),
      telemetryDisabled: this.telemetry.telemetryDisabled(),
      installationId: row.installationId,
      registeredEmail: row.registeredEmail,
      lastHeartbeatAt: row.lastHeartbeatAt ? new Date(row.lastHeartbeatAt).toISOString() : null,
    };
  }

  @Post('register')
  @ApiOperation({ summary: 'Register this instance admin email with the Control Plane' })
  @ApiResponse({ status: 200, description: 'Registered' })
  @ApiResponse({ status: 400, description: 'Control Plane URL not configured or invalid email' })
  async register(@Body() dto: RegisterControlPlaneDto) {
    const row = await this.identity.getOrCreate();
    const result = await this.client.register({
      installationId: row.installationId,
      email: dto.email.trim(),
    });

    if (!result?.ok) {
      throw AppException.upstreamFailed('controlPlane');
    }

    const updated = await this.identity.updateRegisteredEmail(
      result.registeredEmail,
      new Date(result.registeredAt),
    );

    return {
      installationId: updated.installationId,
      registeredEmail: updated.registeredEmail,
      registeredAt: updated.registeredAt
        ? new Date(updated.registeredAt).toISOString()
        : result.registeredAt,
    };
  }
}
