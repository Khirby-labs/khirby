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
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FastifyRequest } from 'fastify';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';
import { RbacService } from '../rbac/rbac.service';
import { IsEmail, IsIn, IsString, MinLength, ValidateIf } from 'class-validator';
// Relative import (like permission-catalog): `nest build` is plain tsc; a bare
// '@khirby/types' specifier would survive into dist. SUPPORTED_LOCALE_CODES is a
// value import, so the relative path is load-bearing here, not just a convention.
import { SUPPORTED_LOCALE_CODES } from '../../../../../packages/types/src';
import type { SessionUser, LoginResponse } from '../../../../../packages/types/src';
import { AppException } from '../errors/app-exception';

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

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private rbac: RbacService,
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Zaloguj się — ustawia httpOnly session cookie' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Zalogowano' })
  @ApiResponse({ status: 401, description: 'Nieprawidłowe dane' })
  async login(@Body() dto: LoginDto, @Req() req: FastifyRequest): Promise<LoginResponse> {
    const user = await this.auth.validateUser(dto.email, dto.password);
    await req.session.regenerate();
    req.session.userId = user.id;
    await req.session.save();
    const permissions = await this.rbac.getUserPermissions(user.id);
    return { user: { ...user, permissions } };
  }

  @Post('logout')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('session')
  @ApiOperation({ summary: 'Wyloguj się — niszczy sesję w Redis' })
  @ApiResponse({ status: 204, description: 'Wylogowano' })
  async logout(@Req() req: FastifyRequest) {
    await req.session.destroy();
  }

  @Get('me')
  @UseGuards(SessionGuard)
  @ApiBearerAuth('session')
  @ApiOperation({ summary: 'Pobierz profil zalogowanego użytkownika' })
  @ApiResponse({ status: 200, description: 'Profil użytkownika' })
  @ApiResponse({ status: 401, description: 'Brak sesji' })
  async me(@Req() req: FastifyRequest): Promise<SessionUser> {
    const user = await this.auth.findById((req.session as any).userId);
    if (!user) throw AppException.sessionExpired();
    const permissions = await this.rbac.getUserPermissions(user.id);
    return { id: user.id, email: user.email, locale: user.locale, permissions };
  }

  @Put('locale')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('session')
  @ApiOperation({ summary: 'Zapisz język interfejsu na koncie (null = język przeglądarki)' })
  @ApiBody({ type: UpdateLocaleDto })
  @ApiResponse({ status: 200, description: 'Zapisano' })
  @ApiResponse({ status: 400, description: 'Nieobsługiwany kod języka' })
  async updateLocale(@Body() dto: UpdateLocaleDto, @Req() req: FastifyRequest) {
    return this.auth.updateLocale((req.session as any).userId, dto.locale);
  }

  @Post('change-password')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('session')
  @ApiOperation({ summary: 'Zmień hasło zalogowanego użytkownika' })
  @ApiResponse({ status: 200, description: 'Hasło zmienione' })
  @ApiResponse({ status: 401, description: 'Nieprawidłowe aktualne hasło' })
  async changePassword(@Body() dto: ChangePasswordDto, @Req() req: FastifyRequest) {
    return this.auth.changePassword(
      (req.session as any).userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
