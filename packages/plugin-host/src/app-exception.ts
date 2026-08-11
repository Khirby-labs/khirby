import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

/** Local mirror of @khirby/types error shapes — keeps plugin-host free of path/rootDir coupling. */
type ErrorCode = string;
type ErrorParams = Record<string, string | number | undefined>;
type ApiErrorBody = {
  statusCode: number;
  code: ErrorCode;
  message: string;
  params?: ErrorParams;
};

/**
 * Factories for HTTP failures the SPA can translate (ADR-0011).
 * Lives in plugin-host so community Nest plugins share the same coded errors.
 */
function body(status: HttpStatus, code: ErrorCode, message: string, params?: ErrorParams) {
  const out: ApiErrorBody = { statusCode: status, code, message };
  if (params && Object.values(params).some((v) => v !== undefined)) out.params = params;
  return out;
}

export const AppException = {
  notFound(entity: string, id?: string): HttpException {
    const subject = id ? `${capitalize(entity)} ${id}` : capitalize(entity);
    return new NotFoundException(
      body(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${subject} not found`, { entity, id }),
    );
  },

  alreadyExists(entity: string, field: 'email' | 'name' | 'slug', value?: string): HttpException {
    return new ConflictException(
      body(HttpStatus.CONFLICT, 'ALREADY_EXISTS', `A ${entity} with this ${field} already exists`, {
        entity,
        field,
        [field]: value,
      }),
    );
  },

  systemEntityImmutable(entity: string, action: string): HttpException {
    return new BadRequestException(
      body(HttpStatus.BAD_REQUEST, 'SYSTEM_ENTITY_IMMUTABLE', `Cannot ${action} system ${entity}`, {
        entity,
        action,
      }),
    );
  },

  lastSuperAdmin(): HttpException {
    return new BadRequestException(
      body(HttpStatus.BAD_REQUEST, 'LAST_SUPER_ADMIN', 'Cannot remove the last super-admin'),
    );
  },

  selfDeleteForbidden(): HttpException {
    return new BadRequestException(
      body(HttpStatus.BAD_REQUEST, 'SELF_DELETE_FORBIDDEN', 'Cannot delete your own account'),
    );
  },

  badRequest(message: string, params?: ErrorParams): HttpException {
    return new BadRequestException(body(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', message, params));
  },

  sessionExpired(): HttpException {
    return new UnauthorizedException(
      body(HttpStatus.UNAUTHORIZED, 'SESSION_EXPIRED', 'Session expired'),
    );
  },

  invalidCredentials(): HttpException {
    return new UnauthorizedException(
      body(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Invalid credentials'),
    );
  },

  currentPasswordInvalid(): HttpException {
    return new UnauthorizedException(
      body(HttpStatus.UNAUTHORIZED, 'CURRENT_PASSWORD_INVALID', 'Current password is incorrect'),
    );
  },

  superAdminRequired(): HttpException {
    return new ForbiddenException(
      body(HttpStatus.FORBIDDEN, 'SUPER_ADMIN_REQUIRED', 'Only a super-admin can modify roles'),
    );
  },

  pluginDisabled(plugin: string): HttpException {
    return new ServiceUnavailableException(
      body(
        HttpStatus.SERVICE_UNAVAILABLE,
        'PLUGIN_DISABLED',
        `${capitalize(plugin)} plugin is disabled.`,
        { name: plugin },
      ),
    );
  },

  pluginRequired(plugin: string, message: string): HttpException {
    return new ServiceUnavailableException(
      body(HttpStatus.SERVICE_UNAVAILABLE, 'PLUGIN_DISABLED', message, { name: plugin }),
    );
  },

  pluginNotConfigured(plugin: string, message: string): HttpException {
    return new BadRequestException(
      body(HttpStatus.BAD_REQUEST, 'PLUGIN_NOT_CONFIGURED', message, { name: plugin }),
    );
  },

  upstreamFailed(service: string): HttpException {
    return new ServiceUnavailableException(
      body(
        HttpStatus.SERVICE_UNAVAILABLE,
        'UPSTREAM_FAILED',
        `${capitalize(service)} is unavailable. Try again later.`,
        { name: service },
      ),
    );
  },
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
