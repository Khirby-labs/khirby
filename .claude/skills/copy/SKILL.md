---
name: copy
description: Write or rewrite the Polish and English UI strings for an i18n namespace, via the copywriter agent. Use when migrating a view to i18n, adding keys for a new feature, or fixing copy that reads like a translation.
---

# /copy — write the interface strings for a namespace

Fills `messages/en/<namespace>.json` and `messages/pl/<namespace>.json` with copy that
is written natively in each language, not translated between them. Voice rules and the
frozen glossary live in `docs/i18n-copy-guide.md`; the architecture is ADR-0011.

Usage: `/copy <namespace>` — e.g. `/copy contacts`. With no argument, ask which one.

## Steps

1. **Collect the keys.** Either the caller supplies them, or read what the view now
   needs: the literals you are about to replace, plus any key already present in
   `messages/en/<namespace>.json`. Keep the list flat — `block.element`.

2. **Record intent for anything ambiguous.** Add or update
   `apps/web/src/i18n/messages/_context/<namespace>.json` for keys where the purpose
   is not obvious from the key path: every message with a `{param}` or a plural, every
   value of one or two words, and anything sitting in a width-constrained slot (sidebar,
   column header, button). One line each: what it is, where it appears, any limit.

   ```json
   { "list.emptyTitle": "Empty state above the “Add contact” button, ≤3 words." }
   ```

   This is the step that makes non-literal copy possible. Skip it and the copywriter
   has nothing but the English string to work from, which is how calques get in.

3. **Dispatch the `copywriter` agent** with the namespace and the key list. It reads the
   guide and the context file, writes both JSON files, and reports back short. Do not
   paste the guide into the prompt — the agent reads it itself.

4. **Check what came back**, briefly:
   - Same key structure in both files, no key in one and not the other.
   - Sentence case, no Title Case, in both languages.
   - Polish: impersonal (no `Twój`/`Ty` except `Zaloguj się`), `„…"` quotes, three
     plural forms, adjectives not stranded by an interpolated enum.
   - Glossary respected — `lead` and `pipeline` stay, `wtyczka` and `zgłoszenie` are
     translated.
   - Anything the agent flagged: add the missing context and re-dispatch just those keys.

5. **Run `pnpm lint:i18n`** for key parity and the mechanical copy checks, then
   `pnpm typecheck:web` if the namespace is new (an incomplete locale fails the compiler
   by design).

## Don't

- Don't write the strings yourself in the main session to "save a step" — the agent
  exists so short copy is written by one voice against one guide, cheaply.
- Don't let the agent touch views, the guide, or the context file. It writes two JSON
  files and nothing else.
- Don't accept a guessed string for a key you couldn't explain. Add the context instead.
- Don't re-decide a glossary term per view. If a term genuinely needs changing, change
  `docs/i18n-copy-guide.md` and say so — it applies everywhere at once.
