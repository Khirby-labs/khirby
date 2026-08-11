export type FormKind = 'contact' | 'waitlist' | 'wishlist' | 'feedback';

export type FormFieldType =
  'text' | 'email' | 'tel' | 'textarea' | 'select' | 'checkbox' | 'number' | 'url';

export type FormLocale = 'pl' | 'en';

export interface FormField {
  name: string;
  /** Resolved visitor label for the requested locale (ADR-0025). */
  label: string;
  type: FormFieldType;
  required: boolean;
  options?: string[];
}

export interface PublicForm {
  name: string;
  slug: string;
  kind: FormKind;
  fields: FormField[];
}

export interface SubmitFormResult {
  success: true;
  contactId: string;
  submissionId: string;
}

export interface GetFormOptions {
  /** Locale for resolved field labels (`?locale=`). Unknown codes fall back to `en` on the CRM. */
  locale?: FormLocale | string;
}

export interface ClientOptions {
  /** CRM base URL, e.g. https://crm.example.com (no trailing slash) */
  baseUrl: string;
  /** Custom fetch (tests, SSR) */
  fetch?: typeof fetch;
  /** Validate payload against schema before POST (default: true) */
  validateBeforeSubmit?: boolean;
  /**
   * Default locale for GET /api/public/forms/:token (`?locale=`).
   * Per-call override: `getForm(token, { locale })`.
   */
  locale?: FormLocale | string;
}

export interface FormFieldDefinition {
  name: string;
  label?: string;
  type?: FormFieldType | string;
  required?: boolean;
  /** Allowed values for a `select` field. */
  options?: string[];
}
