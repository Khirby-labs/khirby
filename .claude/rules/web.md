---
paths:
  - apps/web/**
description: Vue 3 SPA — Composition API, Pinia, cookie-based fetch, and the Honey & Graphite design system.
---

# Web (apps/web) rules

Extends AGENTS.md — the working detail for the Vue 3 SPA (Vite, Pinia, Tailwind, Vue Router 4).
The authority for anything visual is **`docs/DESIGN-SYSTEM.md`** (rationale: `docs/adr/0007`).
CI enforces the mechanical parts via `scripts/design-guard.mjs` (`pnpm lint:design`).
The authority for anything **user-facing text** is **`.claude/rules/i18n.md`** — the app ships
Polish and English, so a hardcoded English literal is a bug. Write copy via `/copy`.

## Components
- **`<script setup>` Composition API only** — never the Options API.
- Pinia stores use `defineStore` with the Composition API (setup) style.
- Overlays/controls come from **Reka UI primitives** styled with tokens
  (`apps/web/src/components/ui/`, `cn()` from `src/lib/utils.ts`). Never install a styled
  component library (PrimeVue, Vuetify, Element…).
- Modals: `AppModal` with the `title` prop (Reka Dialog under the hood).
- Dates: **never** `<input type="date|datetime-local|time|month|week">` — `design-guard`
  rejects it, because the browser draws the glyph and the panel and no token reaches them.
  Use `AppDatePicker` (one day) or `AppDateRangePicker` (from–to + presets); both model an
  ISO day string, never a `Date`, and `@internationalized/date` stays inside
  `utils/date-range.ts` (ADR-0012). Anchored panels sit on `AppPopover`.
- Destructive actions: `await useConfirm()({ title, message, confirmLabel: 'Delete X' })` —
  never `window.confirm`; the confirm button names the object, never "OK"/"Confirm".
  Name the held reference **`askConfirm`**, not `confirm`: `design-guard`'s native-`confirm(`
  rule matches a bare `confirm(` call and would flag the sanctioned API itself.
- Feedback after mutations: `useToastStore().success('Saved')` — no silent saves.
- Icons: monochrome inline SVG with `currentColor` (see `components/nav-icons.ts`).
  Emoji are banned in chrome.

## App shell (components/shell/) — ADR-0008, DESIGN-SYSTEM §6.1
- **Title is single-sourced.** Set `route.meta.title` (+ `meta.parent` for nested routes). The
  top bar renders a breadcrumb only on nested routes; it never shows a title on top-level pages.
  Keep the view's own `<h2 class="crm-page-title">` in the content — do **not** add a title to chrome.
- **Page controls go through `<PageActions>`** (teleports to the top bar's `#topbar-actions`).
  Never hand-build a second header/actions bar in the shell.
- **Nav is declared once** in `src/lib/nav.ts`. Admin surfaces live in the Settings console
  (`/settings/*`), not the main sidebar list.
- **Search / `⌘K` navigates, quick-creates, and searches contacts** (email / name / phone via
  `GET /api/contacts?search=`). It does not yet search leads or mail — don't write copy implying
  full CRM full-text until that exists.

## API calls
- Every route is behind the `/api/` prefix — fetch `/api/contacts`, not `/contacts`.
- Send `credentials: 'include'` on **every** request — the session cookie is the only auth.
  **Never** add an `Authorization` header; there is no token, no localStorage.
- Failures throw **`ApiError`** (`api/client.ts`) carrying `status`, `code`, `params` and — for
  `VALIDATION_FAILED` — per-field `fields`. `message` is the server's English text and stays
  populated, so `catch (e) { error.value = e.message }` still works.
  **Branch on `code`/`status`, never on `message`** — prose gets translated (ADR-0011).
- The client bounces to `/login` **only** on `code === 'SESSION_EXPIRED'`. A rejected login or a
  wrong current password stays on the page and shows its real reason.

## Colors & theming
- **Never hardcode colors** in views: no `text-[#…]`, no `bg-[rgba(…)]`, no built-in
  Tailwind palette (`red-500`, `neutral-800`…). Use semantic token classes
  (`text-danger`, `bg-surface-panel`, `border-border`). Missing a token? Add it in
  `apps/web/src/style.css` + `apps/web/tailwind.config.ts` first.
- Both themes come from one token set (`:root` = dark, `:root[data-theme="light"]`).
  **Never branch on the active theme in a component** — fix the token value instead.
- Honey accent = CTA / focus / selection / active-nav ONLY. Warnings use `warning`
  (orange), never the accent. Status is never color-alone (dot + label).

## Every view must define
- **Loading**: skeleton (`SkeletonRows` or AppTable's `loading` prop), not a spinner-only page.
- **Empty**: `EmptyState` — one sentence + a primary action ("No contacts yet" → `+ Add contact`).
  Never a bare gray string.
- **Error**: what happened + how to fix (`.crm-error`), no apologies, never vague.
- Data values (emails, amounts, dates, IDs) get `font-mono`; digits align via tabular-nums.

## Tests (Vitest)
- Run from root: `pnpm test:web`. Typecheck is `vue-tsc --noEmit` (`pnpm typecheck:web`).
- Before finishing web work: `pnpm lint:design && pnpm typecheck:web && pnpm test:web` —
  CI (`test:web`) runs exactly this.

### Methodology — measure the boundary, not our own code
Rationale: **ADR-0010**. A web test must assert **observable behavior at a system boundary**: what the user
sees (real DOM), or what the backend sees (an HTTP request on the wire). Stores,
composables and the api client are implementation detail. A test that mocks our own
module and asserts it was called measures the code, not the capability — it is green
by construction and survives any real regression.

- **Don't** `vi.mock('../api/client')` in store/component specs and assert
  `toHaveBeenCalledWith('/api/roles/1', …)` — that mirrors the implementation line for
  line and disables the layer where integration bugs actually live.
  **Do** mock only real boundaries: the network via **MSW** (a handler on `/api/roles`
  returns a fixture that flows through the real `client.ts`), and browser APIs
  (`EventSource`, `matchMedia`, timers). Store + client + serialization + error mapping
  then go through the test together. (`client.spec.ts` already does this by mocking only
  `fetch` — extend that reach, don't mock inward.)
- **Don't** cover a view by testing the store behind it. **Do** mount the real component
  with real Reka UI primitives, act on the DOM, and assert what the user observes — the
  pattern in `composables/useConfirm.spec.ts` (born from the 2026-07-24 silent-no-op
  incident; it is the only layer that would have caught it).
- **Don't** hand-write response fixtures and treat them as truth. **Do** shape them from
  `@khirby/types`, so a drift in the API response shape fails typecheck, not prod.
- Pure functions (`lib/nav.ts`, `utils/*-helpers.ts`) get plain input→output units — no
  mocks at all. Tautology is impossible there.
