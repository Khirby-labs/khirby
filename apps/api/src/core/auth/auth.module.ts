import { Module, forwardRef } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OidcService } from './oidc.service';
import { SessionGuard } from './session.guard';
import { BootstrapService } from './bootstrap.service';
import { RbacModule } from '../rbac/rbac.module';
import { ControlPlaneModule } from '../../modules/control-plane/control-plane.module';

@Module({
  imports: [RbacModule, forwardRef(() => ControlPlaneModule)],
  controllers: [AuthController],
  providers: [AuthService, OidcService, SessionGuard, BootstrapService],
  exports: [AuthService, OidcService, SessionGuard],
})
export class AuthModule {}
