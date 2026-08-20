import { ArgumentsHost, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppException } from '../errors/app-exception';
import { validationExceptionFactory } from '../errors/validation-exception-factory';
import type { ApiErrorBody } from '../../../../../packages/types/src';

/**
 * The response body IS the contract the SPA translates against (ADR-0011), so
 * this asserts what a client actually receives — not how the filter is written.
 */
function capture(exception: unknown): { status: number; body: ApiErrorBody } {
  const sent = {} as { status: number; body: ApiErrorBody };
  const reply = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    send(body: ApiErrorBody) {
      sent.body = body;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => reply }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter().catch(exception, host);
  return sent;
}

describe('AllExceptionsFilter', () => {
  it('passes a coded failure through with its params', () => {
    const { status, body } = capture(AppException.notFound('role', 'r1'));

    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(body).toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Role r1 not found',
      params: { entity: 'role', id: 'r1' },
    });
  });

  it('keeps the English message populated, so `e.message` call sites still work', () => {
    const { body } = capture(AppException.alreadyExists('user', 'email', 'a@b.com'));
    expect(body.message).toBe('A user with this email already exists');
    expect(body.code).toBe('ALREADY_EXISTS');
  });

  /*
   * The regression this session exists to fix: ValidationPipe packs its detail
   * into getResponse(), while the exception's own `.message` degrades to the
   * class name — so every DTO failure used to reach the browser as the literal
   * string "Bad Request Exception".
   */
  it('surfaces per-field validation detail instead of "Bad Request Exception"', () => {
    const pipeError = validationExceptionFactory([
      {
        property: 'email',
        constraints: { isEmail: 'email must be an email' },
      },
    ]);

    const { status, body } = capture(pipeError);

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.message).toBe('email must be an email');
    expect(body.message).not.toBe('Bad Request Exception');
    expect(body.fields).toEqual([
      { field: 'email', constraint: 'isEmail', message: 'email must be an email' },
    ]);
  });

  it('reports nested DTO fields with a dotted path', () => {
    const pipeError = validationExceptionFactory([
      {
        property: 'source',
        children: [{ property: 'referer', constraints: { isUrl: 'referer must be a URL' } }],
      },
    ]);

    expect(capture(pipeError).body.fields).toEqual([
      { field: 'source.referer', constraint: 'isUrl', message: 'referer must be a URL' },
    ]);
  });

  it('maps a plain Nest exception to a code so the SPA can still translate it', () => {
    const { body } = capture(new BadRequestException('Duplicate stage IDs'));
    expect(body).toMatchObject({ code: 'BAD_REQUEST', message: 'Duplicate stage IDs' });
  });

  it('accepts a string response body', () => {
    const { body } = capture(new HttpException('teapot', 418));
    expect(body.message).toBe('teapot');
  });

  it('never leaks internals on a 5xx', () => {
    const { status, body } = capture(new Error('PostgresError: relation "x" does not exist'));

    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body).toEqual({
      statusCode: 500,
      code: 'INTERNAL',
      message: 'Internal server error',
    });
  });

  it('does not send twice when reply was already sent (SSE hijack)', () => {
    const sent = {} as { status: number; body: ApiErrorBody; sendCount: number };
    sent.sendCount = 0;
    const reply = {
      sent: true,
      raw: { writableEnded: false },
      status(code: number) {
        sent.status = code;
        return this;
      },
      send(body: ApiErrorBody) {
        sent.sendCount += 1;
        sent.body = body;
      },
    };
    const host = {
      switchToHttp: () => ({ getResponse: () => reply }),
    } as unknown as ArgumentsHost;

    new AllExceptionsFilter().catch(AppException.notFound('role', 'r1'), host);
    expect(sent.sendCount).toBe(0);
  });
});
