import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createClient,
  CrmFormsError,
  type FormField,
  type SubmitFormResult,
} from '@khirby/forms-client'
import type { UseCrmFormOptions, UseCrmFormResult, CrmFormStatus } from './types.js'

function initialValuesForFields(fields: FormField[]): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const field of fields) {
    values[field.name] = field.type === 'checkbox' ? false : ''
  }
  return values
}

function clientValidate(
  fields: FormField[],
  values: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {}

  for (const field of fields) {
    const value = values[field.name]
    const empty =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '') ||
      (typeof value === 'boolean' && value === false && field.required)

    if (field.required && empty && field.type !== 'checkbox') {
      errors[field.name] = 'This field is required'
      continue
    }

    if (field.required && field.type === 'checkbox' && value !== true) {
      errors[field.name] = 'This field is required'
      continue
    }

    if (field.type === 'email' && typeof value === 'string' && value.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
        errors[field.name] = 'Invalid email'
      }
    }
  }

  // CRM always requires top-level email
  const email = String(values.email ?? '').trim()
  if (!email) {
    errors.email = errors.email || 'A valid email address is required'
  }

  return errors
}

export function useCrmForm({
  token,
  baseUrl,
  fetch: fetchFn,
  locale,
}: UseCrmFormOptions): UseCrmFormResult {
  const client = useMemo(
    () => createClient({ baseUrl, fetch: fetchFn, locale }),
    [baseUrl, fetchFn, locale],
  )

  const [status, setStatus] = useState<CrmFormStatus>('idle')
  const [fields, setFields] = useState<FormField[]>([])
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SubmitFormResult | null>(null)

  useEffect(() => {
    if (!token || !baseUrl) {
      setStatus('error')
      setError('Missing form token or CRM base URL')
      return
    }

    let cancelled = false
    setStatus('loading')
    setError(null)
    setResult(null)

    client
      .getForm(token)
      .then((form) => {
        if (cancelled) return
        const nextFields = Array.isArray(form.fields) ? form.fields : []
        setFields(nextFields)
        setValues(initialValuesForFields(nextFields))
        setFieldErrors({})
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message =
          err instanceof CrmFormsError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to load form'
        setError(message)
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [client, token, baseUrl, locale])

  const setValue = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }))
    setFieldErrors((prev) => {
      if (!prev[name]) return prev
      const next = { ...prev }
      delete next[name]
      return next
    })
  }, [])

  const reset = useCallback(() => {
    setValues(initialValuesForFields(fields))
    setFieldErrors({})
    setError(null)
    setResult(null)
    setStatus(fields.length ? 'ready' : 'idle')
  }, [fields])

  const submit = useCallback(async (): Promise<SubmitFormResult | null> => {
    const validationErrors = clientValidate(fields, values)
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors)
      setStatus('ready')
      return null
    }

    setStatus('submitting')
    setError(null)
    setFieldErrors({})

    try {
      const payload: Record<string, unknown> = { ...values }
      // Normalize number fields
      for (const field of fields) {
        if (field.type === 'number' && typeof payload[field.name] === 'string') {
          const raw = String(payload[field.name]).trim()
          if (raw !== '') payload[field.name] = Number(raw)
        }
      }

      const submitResult = await client.submit(token, payload)
      setResult(submitResult)
      setStatus('success')
      return submitResult
    } catch (err: unknown) {
      const message =
        err instanceof CrmFormsError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to submit form'
      setError(message)
      setStatus('error')
      return null
    }
  }, [client, fields, token, values])

  return {
    status,
    fields,
    values,
    setValue,
    fieldErrors,
    error,
    submit,
    reset,
    result,
  }
}
