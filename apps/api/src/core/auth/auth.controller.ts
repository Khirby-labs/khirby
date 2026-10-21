import {
  Controller,
  Post,
  Put,
  Get,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Throttle } from '@nestjs/throttler';
import { FastifyRequest } from 'fastify';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { OidcService } from './oidc.service';
import { SessionGuard } from './session.guard';
import { RbacService } from '../rbac/rbac.service';
import { IsEmail, IsIn, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
// Relative import (like permission-catalog): `nest build` is plain tsc; a bare
// '@khirby/types' specifier would survive into dist. SUPPORTED_LOCALE_CODES is a
// value import, so the relative path is load-bearing here, not just a convention.
import { SUPPORTED_LOCALE_CODES } from '../../../../../packages/types/src';
import type { SessionUser, LoginResponse } from '../../../../../packages/types/src';
import { AppException } from '../errors/app-exception';
import {
  SCOPE_PROVIDER,
  SESSION_MEMBERSHIP_SYNC,
  type ScopeProviderLike,
  type SessionMembershipSyncLike,
  resolveLoadedProvider,
} from '../../../../../packages/plugin-host/src';

class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
}

/**
 * `null` is a meaningful value, not a missing one: it clears the account's choice
 * so the SPA goes back to following the browser (ADR-0011). `ValidateIf` lets it
 * through while still rejecting any string outside the registry.
 */
class UpdateLocaleDto {
  @ValidateIf((_, value) => value !== null)
  @IsIn(SUPPORTED_LOCALE_CODES as unknown as string[])
  locale: string | null;
}

class ChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString() @MinLength(8) newPassword: string;
}

class OidcCompleteDto {
  @IsString() code: string;
  @IsString() state: string;
}

class OidcLinkStartDto {
  @IsOptional() @IsString() password?: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private oidc: OidcService,
    private rbac: RbacService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Volume Enterprise plugin may bind SCOPE_PROVIDER after boot (ADR-0048 / ADR-0055). */
  private scopeProvider(): ScopeProviderLike | null {
    return resolveLoadedProvider<ScopeProviderLike>(this.moduleRef, SCOPE_PROVIDER);
  }

  /** Firm membership lives in the multi-workspace plugin. Community installs skip this. */
  private async syncMembership(userId: string, email: string | null | undefined): Promise<void> {
    const sync = resolveLoadedProvider<SessionMembershipSyncLike>(
      this.moduleRef,
      SESSION_MEMBERSHIP_SYNC,
    );
    if (!sync) return;
    try {
      await sync.syncForUser(userId, email);
    } catch {
      /* plugin not ready */
    }
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in — sets an httpOnly session cookie' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Logged in' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto, @Req() req: FastifyRequest): Promise<LoginResponse> {
    const user = await this.auth.validateUser(dto.email, dto.password);
    await this.syncMembership(user.id, user.email);
    await req.session.regenerate();
    req.session.userId = user.id;
    const provider = this.scopeProvider();
    if (provider) {
      try {
        const scopeId = await provider.resolveFromSession({ userId: user.id });
        if (scopeId) req.session.scopeId = scopeId;
      } catch {
        /* Community / provider not ready */
      }
    }
    await req.session.save();
    return { user: await this.toSessionUser(user, req.session.scopeId) };
  }

  @Post('logout')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('session')
  @ApiOperation({ summary: 'Log out — destroys the Redis session' })
  @ApiResponse({ status: 204, description: 'Logged out' })
  async logout(@Req() req: FastifyRequest) {
    await req.session.destroy();
  }

  @Get('me')
  @UseGuards(SessionGuard)
  @ApiBearerAuth('session')
  @ApiOperation({ summary: 'Get the current user profile' })
  @ApiResponse({ status: 200, description: 'User profile' })
  @ApiResponse({ status: 401, description: 'No session' })
  async me(@Req() req: FastifyRequest): Promise<SessionUser> {
    const user = await this.auth.findById((req.session as any).userId);
    if (!user) throw AppException.sessionExpired();
    return this.toSessionUser(user, req.session.scopeId);
  }

  @Put('locale')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('session')
  @ApiOperation({ summary: 'Save UI locale on the account (null = browser language)' })
  @ApiBody({ type: UpdateLocaleDto })
  @ApiResponse({ status: 200, description: 'Saved' })
  @ApiResponse({ status: 400, description: 'Unsupported locale code' })
  async updateLocale(@Body() dto: UpdateLocaleDto, @Req() req: FastifyRequest) {
    return this.auth.updateLocale((req.session as any).userId, dto.locale);
  }

  @Post('change-password')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('session')
  @ApiOperation({ summary: 'Change the current user password' })
  @ApiResponse({ status: 200, description: 'Password changed' })
  @ApiResponse({ status: 401, description: 'Invalid current password' })
  async changePassword(@Body() dto: ChangePasswordDto, @Req() req: FastifyRequest) {
    return this.auth.changePassword(
      (req.session as any).userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Get('oidc/status')
  @ApiOperation({ summary: 'Whether central OIDC SSO is enabled' })
  oidcStatus() {
    return this.oidc.status();
  }

  @Get('oidc/login/start')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Start OIDC login (Authorization Code + PKCE)' })
  async oidcLoginStart(@Req() req: FastifyRequest) {
    const redirectUri = this.oidcRedirectUri(req);
    const { state, nonce } = this.oidc.createStateNonce();
    const { verifier, challenge } = this.oidc.createPkce();
    // Redis-backed pending (not only session cookie) — cookie can be missing after
    // the Control Plane redirect (localhost vs 127.0.0.1 / SameSite).
    await this.oidc.savePending(state, {
      mode: 'login',
      nonce,
      verifier,
      redirectUri,
    });
    (req.session as any).oidc = { mode: 'login', state, nonce, verifier, redirectUri };
    await req.session.save();
    const authorizationUrl = await this.oidc.buildAuthorizationUrl({
      mode: 'login',
      redirectUri,
      state,
      nonce,
      codeChallenge: challenge,
    });
    return { authorizationUrl };
  }

  @Post('oidc/complete')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete OIDC login or link; establishes host-only session' })
  async oidcComplete(
    @Body() dto: OidcCompleteDto,
    @Req() req: FastifyRequest,
  ): Promise<LoginResponse> {
    const sessionPending = (req.session as any).oidc as
      | {
          mode: 'login' | 'link';
          state: string;
          nonce: string;
          verifier: string;
          redirectUri: string;
          userId?: string;
        }
      | undefined;
    const redisPending = await this.oidc.takePending(dto.state);
    const pending =
      redisPending ??
      (sessionPending && sessionPending.state === dto.state
        ? {
            mode: sessionPending.mode,
            nonce: sessionPending.nonce,
            verifier: sessionPending.verifier,
            redirectUri: sessionPending.redirectUri,
            userId: sessionPending.userId,
          }
        : null);
    if (!pending) {
      throw AppException.invalidCredentials();
    }
    const sessionUserId = (req.session as any).userId as string | undefined;
    // Link completion must be the same browser session that started it.
    if (pending.mode === 'link' && (!pending.userId || pending.userId !== sessionUserId)) {
      throw AppException.invalidCredentials();
    }
    const localUserId = pending.mode === 'link' ? pending.userId : undefined;
    const user = await this.oidc.complete({
      code: dto.code,
      redirectUri: pending.redirectUri,
      codeVerifier: pending.verifier,
      expectedNonce: pending.nonce,
      mode: pending.mode,
      localUserId,
    });
    await this.syncMembership(user.id, user.email);
    delete (req.session as any).oidc;
    await req.session.regenerate();
    req.session.userId = user.id;
    const provider = this.scopeProvider();
    if (provider) {
      try {
        const scopeId = await provider.resolveFromSession({ userId: user.id });
        if (scopeId) req.session.scopeId = scopeId;
      } catch {
        /* Community / provider not ready */
      }
    }
    await req.session.save();
    return { user: await this.toSessionUser(user, req.session.scopeId) };
  }

  @Get('oidc/link/status')
  @UseGuards(SessionGuard)
  @ApiBearerAuth('session')
  @ApiOperation({ summary: 'Account linking status for current user (ADR-0010)' })
  oidcLinkStatus(@Req() req: FastifyRequest) {
    return this.oidc.linkStatus((req.session as any).userId);
  }

  @Post('oidc/link/start')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('session')
  @ApiOperation({ summary: 'Start OIDC account link; preserves local userId' })
  async oidcLinkStart(@Body() dto: OidcLinkStartDto, @Req() req: FastifyRequest) {
    const userId = (req.session as any).userId as string;
    await this.oidc.assertPassword(userId, dto.password);
    const redirectUri = this.oidcRedirectUri(req);
    const { state, nonce } = this.oidc.createStateNonce();
    const { verifier, challenge } = this.oidc.createPkce();
    await this.oidc.savePending(state, {
      mode: 'link',
      nonce,
      verifier,
      redirectUri,
      userId,
    });
    (req.session as any).oidc = { mode: 'link', state, nonce, verifier, redirectUri, userId };
    await req.session.save();
    const authorizationUrl = await this.oidc.buildAuthorizationUrl({
      mode: 'link',
      redirectUri,
      state,
      nonce,
      codeChallenge: challenge,
    });
    return { authorizationUrl, status: 'link_pending' as const };
  }

  private oidcRedirectUri(req?: FastifyRequest): string {
    const configured = process.env.OIDC_REDIRECT_URI?.trim();
    if (!configured) {
      throw new ServiceUnavailableException('OIDC_REDIRECT_URI is not configured');
    }
    const configuredUrl = new URL(configured);
    // Only swap localhost ↔ 127.0.0.1 on the same port. Any other Origin is ignored
    // so the redirect stays on the URI registered with Control Plane.
    const originHeader = req?.headers?.origin ?? req?.headers?.referer;
    if (typeof originHeader === 'string' && originHeader) {
      try {
        const requestOrigin = new URL(originHeader);
        const localHosts = new Set(['localhost', '127.0.0.1']);
        if (
          localHosts.has(requestOrigin.hostname) &&
          localHosts.has(configuredUrl.hostname) &&
          requestOrigin.protocol === configuredUrl.protocol &&
          requestOrigin.port === configuredUrl.port
        ) {
          return `${requestOrigin.origin}${configuredUrl.pathname}`;
        }
      } catch {
        /* fall through */
      }
    }
    return configured;
  }

  private async toSessionUser(
    user: {
      id: string;
      email: string;
      locale: string | null;
    },
    preferredScopeId?: string | null,
  ): Promise<SessionUser> {
    const [permissions, isSuperAdmin] = await Promise.all([
      this.rbac.getUserPermissions(user.id),
      this.rbac.isSuperAdmin(user.id),
    ]);
    let scope: Record<string, unknown> | null = null;
    const provider = this.scopeProvider();
    if (provider?.getSessionClaims) {
      try {
        scope = (await provider.getSessionClaims(user.id, preferredScopeId)) ?? null;
      } catch {
        scope = null;
      }
    }
    return {
      id: user.id,
      email: user.email,
      locale: user.locale,
      permissions,
      isSuperAdmin,
      scope,
    };
  }
}
