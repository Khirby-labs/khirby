import { Controller, Get, Put, Post, Body, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { FastifyRequest, FastifyReply } from 'fastify';
import { SessionGuard } from '../../core/auth/session.guard';
import { PermissionGuard } from '../../core/rbac/rbac.guard';
import { RequirePermission } from '../../core/rbac/require-permission.decorator';
import { MailboxService } from './mailbox.service';
import { UpsertMailboxDto } from './dto/upsert-mailbox.dto';
import { AppException } from '../../core/errors/app-exception';

@ApiTags('mail')
@Controller('mail/mailbox')
export class MailboxController {
  constructor(private readonly mailbox: MailboxService) {}

  @Get()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission('integrations', 'manage')
  get() {
    return this.mailbox.get();
  }

  @Put()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission('integrations', 'manage')
  upsert(@Body() dto: UpsertMailboxDto) {
    return this.mailbox.upsert(dto);
  }

  @Post('test')
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission('integrations', 'manage')
  test() {
    return this.mailbox.testStoredConnection();
  }

  @Get('oauth/google/start')
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission('integrations', 'manage')
  startGoogleOAuth(@Req() req: FastifyRequest) {
    const userId = req.session.userId;
    if (!userId) throw AppException.sessionExpired();
    return this.mailbox.startGoogleOAuth(userId);
  }

  /**
   * Google redirects here without the session cookie (SameSite=strict).
   * Auth is the HMAC-signed `state` issued at /start.
   */
  @Get('oauth/google/callback')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async googleOAuthCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    const url = await this.mailbox.handleGoogleOAuthCallback({ code, state, error });
    return reply.redirect(url, 302);
  }

  @Post('oauth/google/disconnect')
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission('integrations', 'manage')
  disconnectGoogle() {
    return this.mailbox.disconnectGoogleOAuth();
  }
}
