import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
// Relative path, not '@khirby/types' — `nest build` is plain tsc and a bare
// specifier would survive into dist (AGENTS.md pitfall). Type-only here anyway.
import type { ApiErrorBody, ErrorCode, FieldError } from '../../../../../packages/types/src';

/** Nest's own exception classes, mapped to a code the SPA can translate. */
const STATUS_CODES: Record<number, ErrorCode> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'SESSION_EXPIRED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'ALREADY_EXISTS',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'UPSTREAM_FAILED',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();

    if (reply.sent || reply.raw?.writableEnded) return;

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      // Full detail (incl. PostgresError stack + filesystem paths) stays in the
      // server log only — it must never reach the HTTP response body.
      this.logger.error(
        exception instanceof Error ? exception.message : 'Unknown error',
        exception instanceof Error ? exception.stack : undefined,
      );
      // Generic body: never leak stack traces or internal paths, in any environment.
      reply.status(status).send({
        statusCode: status,
        code: 'INTERNAL',
        message: 'Internal server error',
      } satisfies ApiErrorBody);
      return;
    }

    reply.status(status).send(this.buildBody(exception, status));
  }

  /**
   * Reads `getResponse()`, not `.message`.
   *
   * ValidationPipe packs its per-field detail into the response object while the
   * exception's own `.message` degrades to the class name — which is why every
   * DTO failure used to reach the browser as the literal string "Bad Request
   * Exception". Reading the response object fixes that, and lets AppException's
   * `code` / `params` / `fields` through unchanged.
   */
  private buildBody(exception: unknown, status: number): ApiErrorBody {
    const fallbackCode = STATUS_CODES[status] ?? 'BAD_REQUEST';

    if (!(exception instanceof HttpException)) {
      return { statusCode: status, code: fallbackCode, message: 'Internal server error' };
    }

    const response = exception.getResponse();
    if (typeof response === 'string') {
      return { statusCode: status, code: fallbackCode, message: response };
    }

    const body = (response ?? {}) as Record<string, unknown>;
    const rawMessage = body.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.filter((m): m is string => typeof m === 'string').join('; ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : exception.message;

    const out: ApiErrorBody = {
      statusCode: status,
      code: isErrorCode(body.code) ? body.code : fallbackCode,
      message,
    };
    if (body.params && typeof body.params === 'object') {
      out.params = body.params as ApiErrorBody['params'];
    }
    if (Array.isArray(body.fields)) out.fields = body.fields as FieldError[];
    return out;
  }
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && value.length > 0 && value === value.toUpperCase();
}
