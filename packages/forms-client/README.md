# @khirby/forms-client

Low-level SDK for Khirby **public forms**. Docs: [forms-client](https://khirby.com/docs/forms/forms-client) · [Landing forms](https://khirby.com/docs/forms/)

CRM is the source of truth for field schema. This package only talks to:

| Method | Path |
|--------|------|
| `GET` | `/api/public/forms/:token` |
| `POST` | `/api/public/forms/:token/submit` |

`:token` = form **endpoint token** from CRM → Forms → Integration (not a session JWT).

## When to use this vs `forms-ui`

| Package | Use when |
|---------|----------|
| **forms-client** | Headless submit, Node scripts, codegen, custom UI |
| **forms-ui** | Ready React form that fetches fields + renders + submits |
| **payload-forms** | Payload admin: registry of tokens + page block |

Most landings should use **`forms-ui`** (which depends on this package).

## Install

```bash
echo @khirby:registry=https://registry.npmjs.org >> .npmrc
npm i @khirby/forms-client
```

Full public guide: landing-site product docs (forms). In-repo author notes: this package README.

Monorepo / workspace:

```bash
pnpm --filter @khirby/forms-client build
pnpm add @khirby/forms-client@workspace:*
```

## Quick start

```ts
import { createClient, CrmFormsError } from '@khirby/forms-client'

const crm = createClient({
  baseUrl: 'https://crm.example.com', // no trailing slash
})

// 1) Load schema (labels, types, required)
const form = await crm.getForm('<endpointToken>')
// form.fields: { name, label, type, required, options? }[]

// 2) Submit — flat object, field names = schema `name`s
//    `email` is always required by CRM
await crm.submit('<endpointToken>', {
  email: 'jan@example.com',
  name: 'Jan',
  message: 'Hello',
})
```

### Payload shape rules

- **Flat JSON** — not `{ data: { … } }`
- Top-level **`email`** always required
- Unknown keys rejected when CRM schema is non-empty
- Client adds honeypot `_hp: ''` on submit
- Field types: `text | email | tel | url | number | textarea | checkbox | select`

### Bound form helper

```ts
const form = await crm.form('<endpointToken>')
form.fields
await form.submit({ email: '…', name: '…' })
```

## Errors

```ts
try {
  await crm.submit(token, data)
} catch (e) {
  if (e instanceof CrmFormsError) {
    // e.status, e.message, e.body
  }
}
```

## Codegen (optional)

```bash
pnpm exec khirby-forms-codegen \
  --base-url https://crm.example.com \
  --form <endpointToken> \
  --out ./src/generated/contact-form.ts
```

## CORS

Browser posts need the landing origin in CRM `CORS_ORIGIN`. Server-side posts do not.

## Build / test

```bash
pnpm --filter @khirby/forms-client build
pnpm --filter @khirby/forms-client test
```

Package is **ESM** (`"type": "module"`) so Vite/Next can import named exports.
