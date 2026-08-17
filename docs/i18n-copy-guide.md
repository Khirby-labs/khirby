# UI copy guide — Polish & English

> Canonical source for **how** interface copy is written in Khirby CRM. Architecture lives in
> `docs/adr/0011-i18n-architecture.md`; the enforceable subset is in `.claude/rules/i18n.md`.
> The `copywriter` agent reads this file — keep it dense and decision-shaped, not chatty.

## 1. Both languages are authored, neither is translated

`pl` and `en` are equal first-class locales. Nobody translates one into the other: each is
written natively for its own reader, from the same **intent**. `en` is the technical fallback
(a missing key must stay readable to any developer or agent), and that is its only privilege.

Consequence: the key plus its context note carry the meaning, not the English string. Where
intent is not recoverable from the key path and the value, it is recorded in
`apps/web/src/i18n/messages/_context/<namespace>.json`:

```json
{
  "password.submit": "Button submitting the change-password form. Imperative, ≤3 words.",
  "list.count": "Row count above a table. Plural. {count} is the number of visible rows."
}
```

A copywriter who cannot recover intent **flags the key** — it never guesses.

## 2. Rules that hold in both languages

- **Sentence case everywhere**, including buttons: `Change password`, `Zmień hasło`. Never
  Title Case. (This normalizes existing copy — `Change Password`, `Save Changes`, `Add Member`
  are legacy and get fixed as each view is migrated.)
- **Actions are imperative and 1–3 words.** `Save`, `Delete contact`, `Zapisz`, `Usuń kontakt`.
- **Errors say what happened and what to do.** No apologies, no blame, no "unexpected error".
- **Empty states are a noun phrase plus an action**, never a bare gray sentence.
- **No “please”, no “we”, no exclamation marks.** The tool does not plead and has no feelings.
- **Real ellipsis `…` and real quotes.** Straight `"` never ships.
- **Numbers, dates and money go through `n()` / `d()`** — never written into a message.
- **Glyphs (`✓ ← → * ·`) stay in markup.** Words go in the message.
- **Length is a constraint, not an afterthought.** A string in the sidebar, a column header or
  a button must fit the same box in both languages. Polish runs 15–20% longer, so shorten it
  as a noun phrase rather than truncating with an ellipsis.

## 3. Polish

**Impersonal, always.** Polish UI that addresses the reader as *Ty* reads as translated-from-
English and ages badly.

| Slot | Do | Don't |
|---|---|---|
| Heading | `Zmiana hasła` (noun) | `Zmień swoje hasło` |
| Button | `Zmień hasło` (imperative) | `Zmienianie hasła` |
| Confirm | `Usunąć „Jan Kowalski"?` (infinitive) | `Czy na pewno chcesz usunąć…?` |
| Error | `Nie udało się zapisać. Spróbuj ponownie.` | `Przepraszamy, nie mogliśmy zapisać Twoich zmian.` |
| Empty | `Brak kontaktów` | `Nie masz jeszcze żadnych kontaktów` |
| Hint | `Dotyczy interfejsu na tym urządzeniu.` | `Twój interfejs na Twoim urządzeniu.` |

- **No `Twój/Twoje/Ty`.** The only tolerated reflexive is `Zaloguj się` — Polish has no
  natural impersonal form for signing in.
- **Progress states are nouns, not gerund calques**: `Ładowanie…`, `Zapisywanie…`,
  `Synchronizacja…` (not `Synchronizowanie…`).
- **Quotes are `„…"`** (U+201E opening, U+201D closing). Dash is the en dash `–` with spaces.
- **Never rely on `text-transform: capitalize`.** It is not Polish casing.
- **Adjectives must agree with their noun**, which is why an enum is never interpolated into
  prose: `Włączona` (wtyczka) vs `Włączony` (webhook). Write a whole sentence per branch.
- **Plurals have three integer forms** — `one | few | many`. Never `1 kontaktów`.

## 4. English

- Contractions are fine and match the existing tone: `Couldn't load members`,
  `System role names can't be changed`.
- Quotes are `"…"`; dash is the em dash `—` unspaced, as in the existing copy.
- Prefer the shorter word: `Delete`, not `Remove permanently`.

## 5. Glossary

Industry vocabulary Polish sales teams actually speak stays in English; everything with a
natural Polish equivalent is translated. **These are frozen — do not re-decide them per view.**

| en | pl | Note |
|---|---|---|
| contact | kontakt | |
| lead | lead | Inflects: `leada`, `leadzie`, `leady`. Never `lead'a`. |
| pipeline | pipeline | Indeclinable: `w pipeline`. Not `lejek sprzedaży`. |
| stage | etap | |
| form | formularz | |
| submission | zgłoszenie | Not `przesłanie`, not `submisja`. |
| field | pole | |
| plugin | wtyczka | |
| newsletter | newsletter | `do newslettera` |
| subscriber | subskrybent | |
| list | lista | |
| role | rola | |
| permission | uprawnienie | |
| member / user | użytkownik | One Polish word for both. `Członek` reads like a club. |
| owner | opiekun | A lead has an `opiekun`, not a `właściciel`. |
| priority | priorytet | `Niski` / `Średni` / `Wysoki` |
| settings | ustawienia | |
| integrations | integracje | |
| password | hasło | |
| session | sesja | |
| retry | `Ponów` on a button; `Spróbuj ponownie` inside a sentence | |
| save / saving / saved | `Zapisz` / `Zapisywanie…` / `Zapisano` | |
| add / create | `Dodaj` (into a list) / `Utwórz` (a new object) | |
| cancel / close / edit / delete | `Anuluj` / `Zamknij` / `Edytuj` / `Usuń` | |
| loading | `Ładowanie…` | |
| no data | `Brak danych` | |
| slug, endpoint, webhook, super-admin | unchanged | Technical identifiers and role names. |

**Never translated at all:** user-entered data, pipeline stage names stored in the database,
plugin display names from the API, form field labels persisted into `forms.schema` (they are
shown to the customer's site visitors — see ADR-0011), and language names in the switcher,
which are always endonyms (`English`, `Polski`).

## 6. Worked examples

| Intent | en | pl |
|---|---|---|
| Empty contact list | `No contacts yet` | `Brak kontaktów` |
| Its action | `Add contact` | `Dodaj kontakt` |
| Search found nothing | `Nothing found for “{query}”` | `Brak wyników dla „{query}"` |
| Kanban drop hint | `Drop leads here` | `Przeciągnij tu leady` |
| Confirm delete | `Delete “{name}”? This can't be undone.` | `Usunąć „{name}"? Tej operacji nie można cofnąć.` |
| Save failed | `Couldn't save the form. Check your connection and try again.` | `Nie udało się zapisać formularza. Sprawdź połączenie i spróbuj ponownie.` |
| Row count | `{count} contact \| {count} contacts` | `{count} kontakt \| {count} kontakty \| {count} kontaktów` |
| Role copy source | `Start empty` | `Od zera` |
| Locale hint | `Saved on the account and used on every device. Data you enter is never translated.` | `Zapisywane na koncie i stosowane na każdym urządzeniu. Wprowadzone dane nie są tłumaczone.` |
