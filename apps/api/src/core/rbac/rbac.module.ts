import { Module } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { PermissionGuard } from '../../../../../packages/plugin-host/src/permission.guard';
import { SessionGuard } from '../../../../../packages/plugin-host/src/session.guard';
import { PluginEnabledGuard } from '../../../../../packages/plugin-host/src/plugin-enabled.guard';
import { RBAC_SERVICE } from '../../../../../packages/plugin-host/src/tokens';

@Module({
  providers: [
    RbacService,
    { provide: RBAC_SERVICE, useExisting: RbacService },
    PermissionGuard,
    SessionGuard,
    PluginEnabledGuard,
  ],
  exports: [RbacService, RBAC_SERVICE, PermissionGuard, SessionGuard, PluginEnabledGuard],
})
export class RbacModule {}
