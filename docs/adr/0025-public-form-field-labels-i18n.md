# 0025 — Public form field labels as multilingual persisted content

- **Status:** Accepted
- **Date:** 2026-08-07
- **Deciders:** Damian Orzeł, Auto
- **Relates to:** ADR-0011 (i18n architecture)
- **Pokelo ADR id:** `cac66b77-063b-4051-af5c-1d5b3bde1c13` (Bearly CRM project)

## Context

Public forms store field labels in `forms.schema` (JSONB). Those strings are
rendered on the *customer's* site (e.g. Khirby landing EN `/` and PL `/pl/`), not
in the CRM operator UI. ADR-0011 already called this out: template seeds stay
English so an operator's UI locale does not silently write Polish into visitor-facing
data.

A bilingual landing needs both languages. Today the schema has a single
`label: string`, so `GET /api/public/forms/:token` returns one language for every
visitor. This is **persisted content for visitors**, not Nest message catalogs or
vue-i18n keys inside the CRM SPA.

## Decision

We store optional per-locale labels on each field and resolve a single string on
the public wire:

```ts
{
  name: 'email',
  label: 'Email',                 // required fallback (= EN / legacy)
  labels?: { en?: string; pl?: string },
  type: 'email',
  required: true,
  options?: string[],             // wire values (stable); optionLabels = follow-up
}
```

**Primary locale signal:** query `?locale=` on `GET /api/public/forms/:token`,
validated against `SUPPORTED_LOCALE_CODES` (`pl` | `en`) from `@crm/types`.
Missing or unknown → fallback **`en`**. We do **not** use `Accept-Language` as
the primary (or sole) mechanism.

**Resolution:** `labels[locale]` → `labels.en` → `label`.

**Public wire stays back-compat:** `fields[].label: string` is the *resolved*
label. The `labels` map is not required on the public response. Submit is
unchanged (keys = `name`).

Admin UI lets the operator author EN and PL natively. On save, `label` is set to
the English value (`labels.en` or the EN input). Templates seed
`labels: { en: '…' }` from the existing English seeds; PL stays empty until filled.

SDKs (`@bearly-crm/forms-client`, `@bearly-crm/forms-ui`) accept an optional
`locale` and pass `?locale=` on schema fetch; cache keys include locale.

## Consequences

**Easier.** Landings request the language they already chose in the URL (`/pl/`).
Old schemas and old SDK clients keep working. Cache-Control `max-age=60` remains
valid because locale is part of the URL.

**Harder, accepted.** Operators must fill both languages when they care about
parity. Empty PL falls back to EN. Multilingual `form.name` and select
`optionLabels` are out of scope here (TODO / follow-up).

**Rules agents must not "fix":**

- Do not add Nest/vue-i18n catalogs for public form labels.
- Do not make `Accept-Language` the primary locale selector for this endpoint.
- Do not copy the CRM operator's UI locale into `forms.schema` on create/apply
  template — seeds stay English; PL is authored explicitly.

## Considered alternatives

- **`Accept-Language` only.** Rejected: landings already know their locale from
  the path; header-based selection is opaque, cache-hostile, and easy to get
  wrong behind proxies.
- **Return `labels` map on the public wire and resolve in every client.**
  Rejected as the *required* shape: breaks back-compat for existing
  `@bearly-crm/forms-*` and hand-rolled clients that read `field.label`.
- **Separate form per language.** Rejected: doubles admin work and splits
  submissions.
