# docs/journal/devlog/2026-09-06-kby-130-contact-custom-fields.md
Issue:    KBY-130 (Linear) · branch `pnajsarek/kby-130-custom-fields-kontaktow-import-csv` · PR https://github.com/Khirby-labs/khirby/pull/8

Goal:     Operator-defined contact fields plus a Contacts CSV import that does not clobber `interests` / `listmonk`.

Done:     `custom_field_definitions` + CRUD under `contacts:manage`; contact `PATCH { custom }` via chained `jsonb_set`; list `search` + `customField=slug:value`; `POST /api/contacts/import` JSON `{ mapping, rows }` (cap 1000, Fastify bodyLimit 5 MB); Settings → Custom fields; card editors (AppDatePicker for date); list filter + Import modal (`;` / BOM / CRLF parser). ADR-0041. Tests: custom-fields service, contacts import/filter, parse-csv, CustomFieldsView, ContactImportModal, ContactsView Import button, nav hide/show.

Why so:   A dedicated table for definitions, JSONB bag for values — schema changes without a migration per field. `jsonb_set` not a full `metadata` rewrite so concurrent PATCHes of different keys and plugin keys survive (ADR-0041). CSV is parsed in the browser and posted as JSON so Fastify never has to guess `;` vs `,`. Mapping is CRM field → CSV column because that is what the operator is filling, not the other way around.

Failed:   - `JSON.stringify` on a Drizzle `sql` fragment is circular — specs must walk the SQL AST (`sqlMentions`) instead of dumping the object.
          - `ListContactsQueryDto` with class-validator `whitelist: true` dropped `customField` until the query DTO declared it.
          - `POST /api/contacts/import` must be registered before `@Get(':id')` or Fastify treats `import` as an id.
          - Reka Dialog teleports — import modal specs query `document`, not the wrapper. jsdom `File` has no `.text()`; polyfill it. Reka Select options are not in the DOM until open, and jsdom has no `PointerEvent`, so the list filter spec only asserts the trigger.
          - Contact detail specs crash without stubbing `AppTooltip` (TooltipProvider).
          - `pnpm add` of papaparse was considered then dropped — a ~100-line parser covers BOM / `;` / quoted commas without a lockfile fight. Do not restage incidental `pnpm-lock.yaml` peer-dep noise (AGENTS.md lockfile incident).

Next:     Linear In Review + comment blocked: `LINEAR_API_KEY` missing from `.env`. Put the key in and run wrap's comment/status, or comment on the PR. Apply migration `0010_contact_custom_fields.sql` on any DB that is not migrated by Docker.

Verify:   `node .claude/scripts/verify.mjs` ✅ after commit `3841bfd` — typecheck clean (api, web, packages), eslint clean, design-guard OK, i18n-guard OK (18 namespaces, 50 migrated files); api 660 tests, web 46 files / 332 tests, forms-client 17, forms-ui 3. `[verify] GREEN — marker written (.claude/.verify-ok.json)`.
