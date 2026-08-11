# 0011 — i18n: two authored locales, keys as the contract

- **Status:** Accepted
- **Date:** 2026-07-24
- **Deciders:** Damian Orzeł, Claude (pairing)
- **Amended:** 2026-07-24 — see *Amendment: account locale and backend-served
  labels* at the end. Extends this decision; reverses nothing in it.

## Context

The SPA shipped with no i18n and roughly 650 hardcoded user-facing strings across
34 of 46 Vue components, plus copy hidden in module-level constants (`lib/nav.ts`,
`useTheme.ts`, router `meta.title`), Pinia store toasts, and ~70 NestJS exception
messages the SPA renders verbatim via `catch (e) { error.value = e.message }`.
It was also already accidentally bilingual: `index.html` declared `lang="pl"` on
an entirely English UI, Swagger tags were Polish, and one Polish error string sat
among English siblings.

The product needs Polish and English at launch, more languages after release.
Crucially, the requirement is **not** translation: each language must read as if
written for its own audience, so a Polish screen is not an English screen with
Polish words in English word order.

Three findings from a six-agent discovery pass shaped the design:

1. **Module-level constants are evaluated at import**, before `app.use(i18n)`. A
   `t()` call there returns the raw key *and* pins the label to the boot locale,
   so a runtime language switch silently leaves the sidebar and every breadcrumb
   behind.
2. **`'Session expired'` is load-bearing control flow** — `auth.store.ts` compares
   `e.message` against that exact English string to distinguish logged-out from
   network-down.
3. **Some "UI copy" is persisted data seen by other people.** The field labels in
   `utils/form-field-templates.ts` are written into `forms.schema` and rendered to
   the *customer's site visitors*, not to the CRM operator.

## Decision

**Two locales, both authored, neither translated.** `pl` and `en` are written
natively for their own reader. `en` is the technical *fallback* only, so a missing
key stays readable to a developer — that is its sole privilege. There is no
"source language" whose strings are the specification.

Because copy is not literal, **the key plus a recorded intent note is the
specification**, not the English string. Intent that a key path cannot convey
lives in `apps/web/src/i18n/messages/_context/<namespace>.json`, one line per key.
Copy is written by a dedicated `copywriter` agent (`/copy <namespace>`, Haiku,
batched) against `docs/i18n-copy-guide.md`; it **flags** a key whose intent it
cannot recover rather than guessing.

Runtime: `vue-i18n@11` in Composition mode. One namespace file per feature per
locale. Named `d()`/`n()` formats declared once per locale, so no call site ever
passes a locale tag or Intl options. A CLDR plural rule per language that needs
one — Polish has three integer forms and vue-i18n's default is English-shaped.
Locale resolution is `localStorage` → `navigator.language` → `en`; `/login` and
`/404` render before a session exists, so it can never depend on `auth.user`.
Currency is a single `TENANT_CURRENCY` constant: single-tenant (ADR-0004) means
one currency, and language only decides its punctuation.

**Enforcement splits across two mechanisms, and which does what matters:**

- **`vue-tsc` gates locale completeness.** `messages/pl/index.ts` ends in
  `satisfies MessageSchema`, so a key missing from — or present only in — Polish
  fails the typecheck.
- **`scripts/i18n-guard.mjs` (`pnpm lint:i18n`, inside `pnpm verify`) gates
  everything else, including key existence.** vue-i18n's typed messages give
  autocomplete, but its `t(key: string)` overload still accepts any string, so
  `vue-tsc` does *not* reject `t('settings.nope')`. This was measured, not
  assumed. The guard also checks parity, empty values, Polish typography
  (straight quotes, Title Case), missing context notes, and runs a **ratchet**:
  only files already migrated are scanned for literal UI text, so each session
  appends its own and coverage never regresses.

## Consequences

**Easier.** Adding a language is a data change: a row in `SUPPORTED_LOCALES` and a
message directory. The switcher, the formats, `<html lang>` and the guard all read
the registry. A missing translation is a red gate rather than a silent production
fallback. Copy stays consistent across ten migration sessions because one agent
writes it against one guide with one frozen glossary.

**Harder, accepted.** A locale ships complete or is not registered — partial
translation work happens on a branch, because `satisfies` makes an incomplete
bundle a build failure. Every countable string needs `t(key, count)` even where
English looks fine at n=1. Whole sentences must be written per enum branch instead
of interpolating the enum, because Polish adjectives agree with their noun
(`Włączona` vs `Włączony`). And the `_context` notes are real authoring work that
buys nothing until the second language is written.

**Rules agents must not "fix"** (see `.claude/rules/i18n.md`):

- Never call `t()` in a module-level constant or a `withDefaults()` default —
  store a `*Key` and translate in a `computed`.
- Never translate persisted or user-entered data; localize the picker, store the
  English seed.
- Never render a DB token as a label or lean on `text-transform: capitalize`.
- Language names in the switcher are endonyms, rendered raw.
- Backend messages are translated in the SPA from stable codes; do **not** add a
  message catalog or `Accept-Language` handling to NestJS.

## Considered alternatives

- **One source locale, the other translated from it.** Rejected: it produces
  exactly the calque the product brief rules out, and it makes the English string
  the de-facto spec, so the second language inherits English word order.
- **A hand-rolled i18n composable.** Rejected: CLDR plural rules, `d()`/`n()`
  formats and `<i18n-t>` for markup-embedded sentences are all genuinely needed
  here, and re-implementing them is strictly worse than a dependency.
- **Server-side `Accept-Language` translation of API messages.** Rejected: the SPA
  already owns every fallback string, so a second catalog in NestJS is more work
  and guarantees drift. The backend ships codes; the SPA owns the copy.
- **A single big-bang lint over all of `apps/web`.** Rejected in favour of the
  ratchet: 650 strings cannot land in one change, and an all-or-nothing guard
  would have to be disabled for the whole migration — precisely when it is most
  useful.
- **Hardcoding Polish as the default locale.** Rejected: it would close the door
  on non-Polish users after release. `navigator.language` decides; an explicit
  choice always wins.

## Amendment: account locale and backend-served labels (2026-07-24)

Two gaps surfaced once the views were migrated. Neither changes a decision above.

**1. The language is stored on the account, not only on the device.** `users.locale`
is nullable, and `NULL` means "no choice made" — the device resolution then stands,
so nothing acquires a default it did not ask for. Resolution becomes
`localStorage → navigator.language → en` **for the first paint**, then the account
value once the session is known, mirrored back into `localStorage`. The original
constraint holds exactly as written: boot never reads `auth.user`, because `/login`
renders before a session exists — and the mirror is what stops every sign-in from
flashing the browser's language. The write endpoint is `PUT /api/auth/locale`,
validating against `SUPPORTED_LOCALE_CODES` in `@crm/types`; that constant is now
shared so the API cannot accept a code the switcher does not offer.

**2. Text the backend owns is served as a stable key *plus* the English literal.**
This keeps "the backend ships codes, the SPA owns the copy" intact for UI labels,
not just error messages. Two shapes:

- **Plugin metadata** (`displayNameKey`, `descriptionKey`, `labelKey` on config
  fields and select options, `navLabelKey` on routes) is declared by the plugin and
  read from the live instance, never from the seeded row. A key the SPA does not
  know falls back to the literal, which is what lets a third-party plugin stay
  readable in a build that has never heard of it. `pnpm lint:i18n` enumerates the
  `*Key` declarations under `plugins/` and `packages/` and fails on one that does
  not resolve in `en/` — without that check a typo degrades to "looks
  untranslated", the least visible possible failure.
- **Rows the API seeded** (the super-admin description, the five pipeline stage
  names) carry no key, so the identifier is the row and the seed literal is part of
  the contract: `@crm/types` holds both the literals and the seeder reads them from
  there. A seeded row is localized **only while it still matches**, so the first
  rename hands the row to the operator permanently. Seeded rows are never rewritten
  in the database in any language, which is why the stage editor's rename input
  binds the *stored* value while the board shows the localized one.

Consequence accepted: a fresh Polish install shows Polish stage names on the board
and the English seed inside the stage editor, until the stage is renamed. The
alternative — localizing the editor too — would write a translation into
`pipeline_stages.name` the first time anyone edited a stage, which is the one thing
this ADR rules out. A hint line in the editor explains the split.

Also closed here: nothing set `document.title`, so every tab read "CRM" regardless
of screen or language. It is now derived from `route.meta.titleKey` and re-derived
on a locale switch, with the product name kept out of the message catalog because a
brand is not copy.
