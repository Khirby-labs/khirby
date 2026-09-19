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
  /**
   * Where submitted data goes on the CRM.
   * - `'lead'` (default): creates a contact + lead (legacy flow).
   * - `'inquiry'`: creates a pre-contact Inquiry aggregate (ADR-0053).
   * Absent on CRM servers older than the inquiry feature — treat as `'lead'`.
   */
  destination?: 'lead' | 'inquiry';
  /**
   * Whether the inquiry flow is static (fixed fields) or adaptive
   * (opening answer → AI plans a batch of follow-ups, shown at once).
   * Only meaningful when `destination === 'inquiry'`.
   */
  intakeMode?: 'static' | 'adaptive';
  /**
   * First visitor-facing question for adaptive forms, resolved for the
   * requested locale. Null/absent when not configured or form is static.
   */
  openingLabel?: string | null;
  /** Server-advertised capability flags (absent on older CRM servers). */
  capabilities?: { adaptiveAvailable: boolean };
}

export interface SubmitFormResult {
  success: true;
  contactId: string;
  submissionId: string;
}

/** Returned by POST /api/public/forms/:token/inquiries */
export interface CreateInquiryResult {
  publicToken: string;
  inquiryId: string;
  /** Adaptive one-shot returns `ready_for_review`; static usually `active`. */
  status?: string;
  /** Optional field echo — server may include submitted field values. */
  [key: string]: unknown;
}

/** Returned by POST /api/public/forms/:token/adaptive/plan (no DB write). */
export interface PlanAdaptiveResult {
  questions: string[];
}

/** One-shot adaptive persist — after planAdaptive. */
export interface SubmitAdaptiveInquiryInput {
  opening: string;
  questions: string[];
  answers: string[];
  locale?: FormLocale | string;
  name?: string;
  email?: string;
  company?: string;
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
