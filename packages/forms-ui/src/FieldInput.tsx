import type { FormField } from '@khirby/forms-client'
import type { CrmFormClassNames } from './types.js'

type FieldInputProps = {
  field: FormField
  value: unknown
  error?: string
  classNames?: CrmFormClassNames
  onChange: (value: unknown) => void
  disabled?: boolean
}

function cx(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(' ')
}

export function FieldInput({
  field,
  value,
  error,
  classNames,
  onChange,
  disabled,
}: FieldInputProps) {
  const inputId = `crm-field-${field.name}`
  const type = field.type || 'text'

  if (type === 'checkbox') {
    return (
      <div className={cx('bcf-field', 'bcf-field--checkbox', classNames?.field)}>
        <label className={cx('bcf-checkbox-label', classNames?.label)} htmlFor={inputId}>
          <input
            id={inputId}
            className={cx('bcf-checkbox', classNames?.checkbox)}
            type="checkbox"
            checked={Boolean(value)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>
            {field.label}
            {field.required ? <span className="bcf-req"> *</span> : null}
          </span>
        </label>
        {error ? <div className={cx('bcf-error', classNames?.error)}>{error}</div> : null}
      </div>
    )
  }

  if (type === 'textarea') {
    return (
      <div className={cx('bcf-field', classNames?.field)}>
        <label className={cx('bcf-label', classNames?.label)} htmlFor={inputId}>
          {field.label}
          {field.required ? <span className="bcf-req"> *</span> : null}
        </label>
        <textarea
          id={inputId}
          className={cx('bcf-input', 'bcf-textarea', classNames?.input, error && 'bcf-input--error')}
          value={String(value ?? '')}
          disabled={disabled}
          required={field.required}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
        />
        {error ? <div className={cx('bcf-error', classNames?.error)}>{error}</div> : null}
      </div>
    )
  }

  if (type === 'select') {
    const options = field.options ?? []
    return (
      <div className={cx('bcf-field', classNames?.field)}>
        <label className={cx('bcf-label', classNames?.label)} htmlFor={inputId}>
          {field.label}
          {field.required ? <span className="bcf-req"> *</span> : null}
        </label>
        <select
          id={inputId}
          className={cx('bcf-input', classNames?.input, error && 'bcf-input--error')}
          value={String(value ?? '')}
          disabled={disabled}
          required={field.required}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select…</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {error ? <div className={cx('bcf-error', classNames?.error)}>{error}</div> : null}
      </div>
    )
  }

  const inputType =
    type === 'email' || type === 'tel' || type === 'url' || type === 'number' ? type : 'text'

  return (
    <div className={cx('bcf-field', classNames?.field)}>
      <label className={cx('bcf-label', classNames?.label)} htmlFor={inputId}>
        {field.label}
        {field.required ? <span className="bcf-req"> *</span> : null}
      </label>
      <input
        id={inputId}
        className={cx('bcf-input', classNames?.input, error && 'bcf-input--error')}
        type={inputType}
        value={String(value ?? '')}
        disabled={disabled}
        required={field.required}
        onChange={(e) =>
          onChange(type === 'number' ? e.target.value : e.target.value)
        }
      />
      {error ? <div className={cx('bcf-error', classNames?.error)}>{error}</div> : null}
    </div>
  )
}
