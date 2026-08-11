# @khirby/payload-forms

Payload CMS plugin for Khirby public forms. Docs: [payload-forms](https://khirby.com/docs/forms/payload-forms) · [Landing forms](https://khirby.com/docs/forms/)

**What it does**

- Registers collection **`crm-forms`** (`title`, `token`, `active`) — token registry only
- Exports layout block **`crmForm`** for Pages (etc.)
- Does **not** sync field schema into Payload — fields always load from CRM at runtime via `@khirby/forms-ui`

## Install (npm (registry.npmjs.org))

```bash
echo @khirby:registry=https://registry.npmjs.org >> .npmrc
npm i @khirby/payload-forms
npm i @khirby/forms-ui
```

If the registry requires auth, see `.npmrc.example` in `@khirby/forms-client`
(or the landing-site forms docs). Peer: `payload` ^3.

### Publishing (maintainers)

From the repo root — bump versions in `packages/*/package.json`, commit, then:

```bash
./scripts/publish-forms-packages.sh crm-forms@0.1.0
```

CI publishes `@khirby/forms-client`, `forms-ui`, and `payload-forms` to the Package Registry.

## Architecture

```
Khirby (schema + leads)
    ↑ GET/POST /api/public/forms/:token
Landing <CrmForm />  (@khirby/forms-ui)
    ↑ token from
Payload crm-forms  (+ optional Home.contact.crmForm / page block)
```

## 1. Enable plugin

```ts
// src/plugins/index.ts
import { khirbyForms } from '@khirby/payload-forms'

export const plugins = [
  khirbyForms(), // optional: { collectionSlug, adminGroup }
  // …
]
```

Then `pnpm generate:types`.

## 2. Add block to Pages (optional)

```ts
import { CrmFormBlock } from '@khirby/payload-forms'

blocks: [CallToAction, Content, MediaBlock, CrmFormBlock]
```

Render with `@khirby/forms-ui` `<CrmForm token={form.token} baseUrl={CRM_URL} />`.

## 3. Admin workflow

1. **Khirby** → Forms → copy endpoint token
2. **Payload** → **CRM Forms** → New → paste token
3. Link on Homepage → Contact **or** insert **CRM Form** block on a Page
4. Env: `VITE_CRM_URL` / `NEXT_PUBLIC_CRM_URL`; CRM `CORS_ORIGIN` includes landing

## Related packages

| Package | Role |
|---------|------|
| `@khirby/forms-client` | HTTP SDK |
| `@khirby/forms-ui` | React `<CrmForm />` |
| `@khirby/payload-forms` | This plugin |
