import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';
import { BootstrapService } from './bootstrap.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, BootstrapService],
  exports: [AuthService, SessionGuard],
})
export class AuthModule {}
