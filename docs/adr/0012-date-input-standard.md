# 0012 — One date-input standard: Reka Calendar over native date inputs

- **Status:** Accepted
- **Date:** 2026-07-25
- **Deciders:** Damian Orzeł, Claude (pairing)

## Context

Reading dates was already standardized: every view formats through the named i18n
formats (`d(value, 'dateShort')`, `apps/web/src/i18n/formats.ts`), so no call site
passes a locale tag or Intl options (ADR-0011). Writing dates had no standard at all.
The only surface that let an operator enter one — the forms-analytics filter — used two
bare `<input type="date">`.

A native date input is the one control the design system cannot reach. Its calendar
glyph is drawn by the user agent (`::-webkit-calendar-picker-indicator`), so it stayed
black on the graphite dark theme, and its drop-down panel is the browser's: wrong
surface, wrong border, wrong focus ring. Its month names follow the OS locale, not the
app locale, so an operator on an English Windows saw an English calendar under Polish
labels. None of that is fixable with tokens, which is why it needed a component rather
than a CSS patch.

Anything we build instead must not become a second date library. `reka-ui@2.10.1`
already ships `Calendar` / `RangeCalendar` primitives and already depends on
`@internationalized/date@3.12.2` (`pnpm-lock.yaml`), so adopting them adds no runtime
weight — only a declared dependency in `apps/web` so we may import the date helpers
directly.

## Decision

Dates are entered through `AppDatePicker` (single day) and `AppDateRangePicker`
(from–to, with presets), built on Reka's Calendar / RangeCalendar over a shared
`AppPopover`, styled with tokens in `apps/web/src/components/ui/`. Native date, time,
month and week inputs are banned and `scripts/design-guard.mjs` rejects them.

Three rules follow from it:

1. **The model value is an ISO day string (`'2026-07-24'`), never a `Date`.** A
   calendar day has no time zone; `new Date('2026-07-24')` is midnight UTC and formats
   as the 23rd west of Greenwich. Time zones enter once, at the query boundary
   (`localDayStart` / `localDayEnd` in `apps/web/src/utils/date-range.ts`).
2. **`@internationalized/date` is imported in exactly one module** — that same
   `utils/date-range.ts`. No view or component sees a `CalendarDate`.
3. **Month and weekday names never enter message files.** The calendar takes its
   locale from `intlTagFor(useI18n().locale)` — the same ref `d()` formats with, so a
   grid can never say July next to a field that says lipiec. Only chrome (placeholder,
   presets, nav labels, the grid's accessible name) is translated.

## Consequences

- **Easier:** a date filter is now one control with presets instead of two loose
  inputs plus an Apply button; both themes and both languages are covered by the token
  layer and by Intl respectively; adding a third language still needs no picker work.
  `AppPopover` is available as the base for the next anchored panel.
- **Harder / cost accepted:** ~350 lines of component we own instead of a browser
  widget we don't, including the keyboard grid — mitigated by Reka owning roving focus,
  Esc, and range selection. Cell state is styled with plain attribute selectors in
  `style.css` (`.crm-cal-day[data-selected]`), not `data-[…]:` utilities, because
  several states set the same property and source order is the only ordering we
  control; the two cell classes are duplicated rather than sharing a base for the same
  reason.
- **Do not "fix" this** by reaching for a native input when a picker feels heavy, or by
  passing a locale tag into a calendar at a call site. The guard rejects the first; the
  second reintroduces exactly the split-locale bug the third rule above exists to
  prevent.
- `:root { color-scheme: dark }` (and `light` under `[data-theme='light']`) was added
  alongside. No native date input remains, but every other UA-drawn control — the
  file-input button, autofill, scrollbars — inherits the same fix.

## Considered alternatives

- **Keep the native inputs and style what CSS can reach.** Rejected: the glyph and
  panel are not reachable, and the locale split is unfixable.
- **Reka's higher-level `DatePicker` / `DateRangePicker` (with segmented `DateField`).**
  Rejected for now: it adds a typed segment editor (dd/mm/yyyy sub-inputs) whose
  segment order and placeholders are a second localization surface. The calendar alone
  covers every current call site; the field can be layered in later without changing
  the model contract.
- **A hand-rolled month grid, no date library.** Rejected: month lengths, DST, week
  starts and locale-aware weekday order are exactly the arithmetic
  `@internationalized/date` already gets right, and it was already installed.
