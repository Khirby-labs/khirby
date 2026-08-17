# @khirby/forms-ui

React UI for Khirby public forms. Docs: [forms-ui](https://khirby.com/docs/forms/forms-ui) · [Landing forms](https://khirby.com/docs/forms/)

- Fetches field schema from CRM at runtime (`getForm`)
- Renders inputs for CRM field types
- Submits via `@khirby/forms-client`
- Does **not** store schema in Payload — labels/fields change when you edit the form in CRM (refresh landing; CRM may cache public schema ~60s)

## Install

```bash
echo @khirby:registry=https://registry.npmjs.org >> .npmrc
npm i @khirby/forms-ui
# peer: react, react-dom >= 18
# pulls in @khirby/forms-client
```

Public guide: landing-site product docs (forms-ui). Source: **KhirbyCRM** monorepo (`packages/forms-ui`).

```tsx
import { CrmForm } from '@khirby/forms-ui'
import '@khirby/forms-ui/styles.css' // required for default skin
```

## Env

Landing (Vite):

```env
VITE_CRM_URL=https://crm.example.com
```

Next.js (Payload frontend / RSC client components):

```env
NEXT_PUBLIC_CRM_URL=https://crm.example.com
```

No trailing slash. Origin must be allowed in CRM `CORS_ORIGIN` for browser submits.

## `<CrmForm />`

```tsx
<CrmForm
  token="<endpointToken>"           // from CRM Forms → Integration
  baseUrl={import.meta.env.VITE_CRM_URL}
  submitLabel="Send"
  successMessage="Thanks — your message was sent."
  classNames={{
    root: 'khirby-form',
    field: 'field',
    submit: 'form-submit',
    error: 'form-note',
    success: 'form-success-inline',
  }}
  onSuccess={(result) => {
    // result.contactId, result.submissionId
  }}
  onError={(err) => console.error(err)}
/>
```

### Props

| Prop | Required | Description |
|------|----------|-------------|
| `token` | yes | CRM form endpoint token |
| `baseUrl` | yes | CRM API origin |
| `submitLabel` | no | Default `"Submit"` |
| `successMessage` | no | Shown after successful submit |
| `classNames` | no | `root`, `field`, `label`, `input`, `checkbox`, `error`, `submit`, `success`, `honeypot` |
| `className` | no | Extra class on root |
| `onSuccess` / `onError` | no | Callbacks |

### Supported field types

`text`, `email`, `tel`, `url`, `number`, `textarea`, `checkbox`, `select` (+ `options` for select).

## `useCrmForm`

For custom markup:

```tsx
const form = useCrmForm({ token, baseUrl })

form.status   // idle | loading | ready | submitting | success | error
form.fields   // from CRM
form.values / form.setValue(name, value)
form.fieldErrors
form.error
form.submit() // Promise<SubmitFormResult | null>
form.reset()
form.result
```

## Styling

Default classes use prefix `bcf-*`. CSS variables on `.bcf-root` / your `classNames.root`:

- `--bcf-fg`, `--bcf-muted`, `--bcf-border`, `--bcf-error`, `--bcf-accent`, `--bcf-bg`, `--bcf-radius`, `--bcf-gap`

Landings typically brand via `classNames.root` (e.g. `.khirby-form`) in their own CSS.

## Typical Payload wiring

1. Store token in Payload (`crm-forms` collection via `@khirby/payload-forms`)
2. Pass populated `form.token` into `<CrmForm />`
3. Do not hardcode field labels in the landing — they come from CRM

See `@khirby/payload-forms` README for admin + block setup.

## Build / test

```bash
pnpm --filter @khirby/forms-ui build
pnpm --filter @khirby/forms-ui test
```
