import { CrmFormsError, FormValidationError } from './errors.js';
import { assertEmailPresent, validateSubmissionDataAgainstSchema } from './validate.js';
import type {
  ClientOptions,
  CreateInquiryResult,
  FormFieldDefinition,
  GetFormOptions,
  PlanAdaptiveResult,
  PublicForm,
  SubmitAdaptiveInquiryInput,
  SubmitFormResult,
} from './types.js';

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

async function parseErrorResponse(res: Response): Promise<CrmFormsError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  const message =
    typeof body === 'object' &&
    body !== null &&
    'message' in body &&
    typeof (body as { message: unknown }).message === 'string'
      ? (body as { message: string }).message
      : res.statusText || `HTTP ${res.status}`;
  return new CrmFormsError(message, res.status, body);
}

function formCacheKey(token: string, locale?: string): string {
  return locale ? `${token}:${locale}` : token;
}

function publicFormUrl(baseUrl: string, token: string, locale?: string): string {
  const path = `${baseUrl}/api/public/forms/${encodeURIComponent(token)}`;
  if (!locale) return path;
  return `${path}?locale=${encodeURIComponent(locale)}`;
}

export interface BoundForm {
  readonly token: string;
  readonly name: string;
  readonly slug: string;
  readonly kind: PublicForm['kind'];
  readonly fields: FormFieldDefinition[];
  readonly destination?: PublicForm['destination'];
  submit(data: Record<string, unknown>): Promise<SubmitFormResult>;
  /**
   * Available when `destination === 'inquiry'`.
   * POSTs to /api/public/forms/:token/inquiries — no email assertion.
   */
  createInquiry?(data: Record<string, unknown>): Promise<CreateInquiryResult>;
}

export interface FormsClient {
  getForm(token: string, options?: GetFormOptions): Promise<PublicForm>;
  /** Lead flow: validates payload and asserts an email field is present. */
  submit(token: string, data: Record<string, unknown>): Promise<SubmitFormResult>;
  /**
   * Inquiry flow: POST /api/public/forms/:token/inquiries.
   * Static: field payload + optional contact.
   * Adaptive: one-shot `{ opening, questions, answers, name?, email?, company?, locale? }`
   * after `planAdaptive`.
   */
  createInquiry(token: string, data: Record<string, unknown>): Promise<CreateInquiryResult>;
  /**
   * Adaptive only: ephemeral plan — no Inquiry row.
   * POST /api/public/forms/:token/adaptive/plan
   */
  planAdaptive(
    token: string,
    input: { opening: string; locale?: string },
  ): Promise<PlanAdaptiveResult>;
  /** Adaptive convenience: plan then one-shot createInquiry. */
  submitAdaptive(token: string, input: SubmitAdaptiveInquiryInput): Promise<CreateInquiryResult>;
  form(token: string, options?: GetFormOptions): Promise<BoundForm>;
}

export function createClient(options: ClientOptions): FormsClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchFn = options.fetch ?? fetch;
  const validateBeforeSubmit = options.validateBeforeSubmit !== false;
  const defaultLocale = options.locale;
  const formCache = new Map<string, PublicForm>();

  async function fetchForm(token: string, useCache: boolean, locale?: string): Promise<PublicForm> {
    const resolvedLocale = locale ?? defaultLocale;
    const key = formCacheKey(token, resolvedLocale);
    if (useCache && formCache.has(key)) {
      return formCache.get(key)!;
    }
    const res = await fetchFn(publicFormUrl(baseUrl, token, resolvedLocale));
    if (!res.ok) throw await parseErrorResponse(res);
    const form = (await res.json()) as PublicForm;
    formCache.set(key, form);
    return form;
  }

  async function submitForm(
    token: string,
    data: Record<string, unknown>,
    schema?: FormFieldDefinition[],
  ): Promise<SubmitFormResult> {
    let payload: Record<string, unknown> = { ...data, _hp: data['_hp'] ?? '' };

    if (validateBeforeSubmit) {
      const fields = schema ?? (await fetchForm(token, true)).fields;
      try {
        const validated = validateSubmissionDataAgainstSchema(fields, payload);
        assertEmailPresent(validated);
        payload = { ...validated, _hp: '' };
      } catch (e) {
        if (e instanceof FormValidationError) {
          throw new CrmFormsError(e.message, 400);
        }
        throw e;
      }
    }

    const res = await fetchFn(`${baseUrl}/api/public/forms/${encodeURIComponent(token)}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw await parseErrorResponse(res);
    return (await res.json()) as SubmitFormResult;
  }

  async function createInquiryForm(
    token: string,
    data: Record<string, unknown>,
  ): Promise<CreateInquiryResult> {
    const payload = { ...data, _hp: data['_hp'] ?? '' };
    const res = await fetchFn(
      `${baseUrl}/api/public/forms/${encodeURIComponent(token)}/inquiries`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) throw await parseErrorResponse(res);
    return (await res.json()) as CreateInquiryResult;
  }

  async function planAdaptive(
    token: string,
    input: { opening: string; locale?: string },
  ): Promise<PlanAdaptiveResult> {
    const res = await fetchFn(
      `${baseUrl}/api/public/forms/${encodeURIComponent(token)}/adaptive/plan`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opening: input.opening,
          ...(input.locale !== undefined ? { locale: input.locale } : {}),
          _hp: '',
        }),
      },
    );
    if (!res.ok) throw await parseErrorResponse(res);
    return (await res.json()) as PlanAdaptiveResult;
  }

  return {
    getForm(token: string, getOptions?: GetFormOptions) {
      return fetchForm(token, false, getOptions?.locale);
    },

    submit(token: string, data: Record<string, unknown>) {
      return submitForm(token, data);
    },

    createInquiry(token: string, data: Record<string, unknown>) {
      return createInquiryForm(token, data);
    },

    planAdaptive,

    async submitAdaptive(token: string, input: SubmitAdaptiveInquiryInput) {
      return createInquiryForm(token, {
        opening: input.opening,
        questions: input.questions,
        answers: input.answers,
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.company !== undefined ? { company: input.company } : {}),
      });
    },

    async form(token: string, getOptions?: GetFormOptions): Promise<BoundForm> {
      const publicForm = await fetchForm(token, true, getOptions?.locale);
      const bound: BoundForm = {
        token,
        name: publicForm.name,
        slug: publicForm.slug,
        kind: publicForm.kind,
        fields: publicForm.fields,
        destination: publicForm.destination,
        submit: (data) => submitForm(token, data, publicForm.fields),
      };
      if (publicForm.destination === 'inquiry') {
        (bound as { createInquiry: BoundForm['createInquiry'] }).createInquiry = (data) =>
          createInquiryForm(token, data);
      }
      return bound;
    },
  };
}
