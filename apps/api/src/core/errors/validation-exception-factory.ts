import { BadRequestException, ValidationError } from '@nestjs/common';
import type { ApiErrorBody, FieldError } from '../../../../../packages/types/src';

/**
 * Turns class-validator output into per-field structure instead of a bag of
 * English sentences (ADR-0011).
 *
 * `constraint` is the rule name (`isEmail`, `minLength`, `matches`), which the
 * SPA maps to translated copy. `message` carries the English original so a
 * constraint without a translation still reads sensibly — a fallback, not the
 * contract.
 *
 * This is the single hook point for every current and future DTO, which is why
 * per-DTO `{ message: '…' }` overrides are no longer needed.
 */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const fields = flatten(errors);
  const body: ApiErrorBody = {
    statusCode: 400,
    code: 'VALIDATION_FAILED',
    // Joined English text, so a client that only reads `message` is unaffected.
    message: fields.map((f) => f.message).join('; ') || 'Validation failed',
    fields,
  };
  return new BadRequestException(body);
}

function flatten(errors: ValidationError[], path = ''): FieldError[] {
  const out: FieldError[] = [];
  for (const error of errors) {
    const field = path ? `${path}.${error.property}` : error.property;
    for (const [constraint, message] of Object.entries(error.constraints ?? {})) {
      out.push({ field, constraint, message });
    }
    if (error.children?.length) out.push(...flatten(error.children, field));
  }
  return out;
}
