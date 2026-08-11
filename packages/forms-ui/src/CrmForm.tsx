import { useEffect } from 'react'
import { FieldInput } from './FieldInput.js'
import type { CrmFormProps } from './types.js'
import { useCrmForm } from './useCrmForm.js'

function cx(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(' ')
}

export function CrmForm({
  token,
  baseUrl,
  locale,
  submitLabel = 'Submit',
  successMessage = 'Thank you. Your message has been sent.',
  classNames,
  className,
  onSuccess,
  onError,
}: CrmFormProps) {
  const form = useCrmForm({ token, baseUrl, locale })

  useEffect(() => {
    if (form.status === 'success' && form.result) {
      onSuccess?.(form.result)
    }
  }, [form.status, form.result, onSuccess])

  useEffect(() => {
    if (form.status === 'error' && form.error) {
      onError?.(new Error(form.error))
    }
  }, [form.status, form.error, onError])

  if (form.status === 'loading' || form.status === 'idle') {
    return (
      <div className={cx('bcf-root', classNames?.root, className)} data-status={form.status}>
        <p className="bcf-loading">Loading form…</p>
      </div>
    )
  }

  if (form.status === 'error' && form.fields.length === 0) {
    return (
      <div className={cx('bcf-root', classNames?.root, className)} data-status="error">
        <div className={cx('bcf-error', classNames?.error)}>{form.error}</div>
      </div>
    )
  }

  if (form.status === 'success') {
    return (
      <div className={cx('bcf-root', classNames?.root, className)} data-status="success">
        <div className={cx('bcf-success', classNames?.success)}>{successMessage}</div>
      </div>
    )
  }

  const disabled = form.status === 'submitting'

  return (
    <form
      className={cx('bcf-root', classNames?.root, className)}
      data-status={form.status}
      onSubmit={(e) => {
        e.preventDefault()
        void form.submit()
      }}
      noValidate
    >
      {/* honeypot — filled by bots, ignored when empty via forms-client */}
      <div className={cx('bcf-hp', classNames?.honeypot)} aria-hidden="true">
        <label htmlFor="crm-hp">Leave empty</label>
        <input
          id="crm-hp"
          name="_hp"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={String(form.values._hp ?? '')}
          onChange={(e) => form.setValue('_hp', e.target.value)}
        />
      </div>

      {form.fields.map((field) => (
        <FieldInput
          key={field.name}
          field={field}
          value={form.values[field.name]}
          error={form.fieldErrors[field.name]}
          classNames={classNames}
          disabled={disabled}
          onChange={(value) => form.setValue(field.name, value)}
        />
      ))}

      {form.error ? (
        <div className={cx('bcf-error', classNames?.error)} role="alert">
          {form.error}
        </div>
      ) : null}

      <button
        type="submit"
        className={cx('bcf-submit', classNames?.submit)}
        disabled={disabled}
      >
        {disabled ? 'Sending…' : submitLabel}
      </button>
    </form>
  )
}
