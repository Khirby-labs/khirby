import type { FormField, SubmitFormResult } from '@khirby/forms-client'

export type CrmFormStatus = 'idle' | 'loading' | 'ready' | 'submitting' | 'success' | 'error'

export type CrmFormClassNames = {
  root?: string
  field?: string
  label?: string
  input?: string
  checkbox?: string
  error?: string
  submit?: string
  success?: string
  honeypot?: string
}

export type UseCrmFormOptions = {
  token: string
  baseUrl: string
  /** Custom fetch (tests) */
  fetch?: typeof fetch
  /** Locale for resolved field labels (`?locale=` on schema GET). */
  locale?: string
}

export type UseCrmFormResult = {
  status: CrmFormStatus
  fields: FormField[]
  values: Record<string, unknown>
  setValue: (name: string, value: unknown) => void
  fieldErrors: Record<string, string>
  error: string | null
  submit: () => Promise<SubmitFormResult | null>
  reset: () => void
  result: SubmitFormResult | null
}

export type CrmFormProps = {
  token: string
  baseUrl: string
  /** Locale for resolved field labels (`?locale=` on schema GET). */
  locale?: string
  submitLabel?: string
  successMessage?: string
  classNames?: CrmFormClassNames
  className?: string
  onSuccess?: (result: SubmitFormResult) => void
  onError?: (error: Error) => void
}
