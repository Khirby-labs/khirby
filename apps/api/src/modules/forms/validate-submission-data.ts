import {
  assertEmailPresent as assertEmailPresentCore,
  FORM_FIELD_TYPES,
  FormValidationError,
  validateSubmissionDataAgainstSchema as validateCore,
} from '../../../../../packages/forms-client/src';
import type { FormFieldDefinition, FormFieldType } from '@khirby/forms-client';
import { AppException } from '../../core/errors/app-exception';

export { FORM_FIELD_TYPES };
export type { FormFieldDefinition, FormFieldType };

export function validateSubmissionDataAgainstSchema(
  schema: FormFieldDefinition[],
  body: Record<string, unknown>,
): Record<string, unknown> {
  try {
    return validateCore(schema, body);
  } catch (e) {
    if (e instanceof FormValidationError) {
      throw AppException.badRequest(e.message);
    }
    throw e;
  }
}

export function assertEmailPresent(data: Record<string, unknown>): void {
  try {
    assertEmailPresentCore(data);
  } catch (e) {
    if (e instanceof FormValidationError) {
      throw AppException.badRequest(e.message);
    }
    throw e;
  }
}
