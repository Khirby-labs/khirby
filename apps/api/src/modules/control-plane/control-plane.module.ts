import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../core/database/database.module';
import { RbacModule } from '../../core/rbac/rbac.module';
import { ControlPlaneClient } from './control-plane.client';
import { ControlPlaneController } from './control-plane.controller';
import { InstallationIdentityService } from './installation-identity.service';
import { TelemetryScheduler } from './telemetry.scheduler';
import { TelemetryService } from './telemetry.service';

/**
 * Outbound Control Plane client + anonymous telemetry.
 * Exported for MarketplaceModule (and later submit flows) to share the HTTP client
 * and installation UUID without importing TelemetryScheduler.
 */
@Module({
  imports: [DatabaseModule, ConfigModule, RbacModule],
  controllers: [ControlPlaneController],
  providers: [
    ControlPlaneClient,
    InstallationIdentityService,
    TelemetryService,
    TelemetryScheduler,
  ],
  exports: [ControlPlaneClient, InstallationIdentityService],
})
export class ControlPlaneModule {}
