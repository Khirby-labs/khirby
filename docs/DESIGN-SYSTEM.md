# Bearly CRM Design System — "Honey & Graphite"

> **Status:** v1.0 — adopted 2026-07-23. This file is the single source of truth for all UI work.
> Any agent or developer touching `apps/web` MUST follow this spec. When a rule here conflicts
> with existing code, the code is legacy — fix it toward this spec.
>
> **Mechanically enforced:** `scripts/design-guard.mjs` (`pnpm lint:design`) fails CI
> (`test:web` job) on hardcoded colors, built-in Tailwind palette classes, `window.confirm`
> and theme branching. Working rules for agents: `.claude/rules/web.md`.

## 1. Philosophy

Bearly CRM is a **work tool**, not a presentation. The UI is dark-first, layered graphite with a
single warm brand accent (honey amber). Three laws govern every screen:

1. **Elevation is light.** Surfaces get *lighter* as they come closer to the user
   (background → panel → card → overlay). No decorative box-shadows; hierarchy comes from
   surface lightness and 1px borders.
2. **Honey is the brand, never a status.** The amber accent appears ONLY on: primary CTA,
   focus ring, selection, active nav indicator. Never on large fills, never to mean "warning".
3. **Color means data.** Semantic colors (success/warning/danger/info) and stage colors report
   state. A colored dot/chip always tells the user something true. Chrome stays neutral.

## 2. Tokens

All tokens are CSS variables defined in `apps/web/src/style.css` (`:root`) and mapped to
Tailwind utilities in `apps/web/tailwind.config.ts`. **Never hardcode hex/rgba values in
views or components. Never use Tailwind's built-in palette (`red-500`, `amber-400`…) for UI.**
If a token is missing, add the token — don't inline a value.

Color variables are stored as raw RGB triplets (`--accent: 227 161 60`) so Tailwind opacity
modifiers work: `bg-accent/15`, `text-danger/80`.

### 2.1 Surfaces (graphite scale)

| Token | Tailwind | Value | Use |
|---|---|---|---|
| `--surface-base` | `bg-surface-base` | `#121417` | App background |
| `--surface-panel` | `bg-surface-panel` | `#1A1D21` | Sidebar, top bar, cards, tables |
| `--surface-elevated` | `bg-surface-elevated` | `#22262B` | Modals, dropdowns, kanban cards |
| `--surface-hover` | `bg-surface-hover` | `#262A30` | Hover fill on elevated elements |
| `--surface-input` | `bg-surface-input` | `#0E1013` | Inputs, wells — *darker* than panel (recessed) |
| `--surface-raise` | `bg-surface-raise` | `rgba(237,234,226,0.05)` | Translucent hover/fill overlay, composes on any surface |
| `--surface-raise2` | `bg-surface-raise2` | `rgba(237,234,226,0.09)` | Stronger overlay (active nav, pressed) |

### 2.2 Text (warm off-whites — never pure `#FFF`)

| Token | Tailwind | Value | Use |
|---|---|---|---|
| `--text-primary` | `text-text-primary` | `#EDEAE2` | Headings, primary content |
| `--text-secondary` | `text-text-secondary` | `#C9C6BE` | Body text, table cells |
| `--text-muted` | `text-text-muted` | `#8F949C` | Labels, captions, nav idle |
| `--text-ghost` | `text-text-ghost` | `#63676E` | Placeholders, timestamps, empty states |

### 2.3 Brand accent (honey)

| Token | Tailwind | Value | Use |
|---|---|---|---|
| `--accent` | `bg-accent` / `text-accent` | `#E3A13C` | Primary CTA, active nav bar, links |
| `--accent-hover` | `bg-accent-hover` | `#EFB254` | Hover state of accent elements (lighter, not darker — dark UI) |
| `--accent-ink` | `text-accent-ink` | `#1A1408` | Text/icon **on** accent fills |
| accent subtle | `bg-accent/15` | 15% alpha | Selected rows, active chips, kbd hints |

### 2.4 Borders (warm-white alphas)

| Token | Tailwind | Value |
|---|---|---|
| `--border-subtle` | `border-border-subtle` | `rgba(237,234,226,0.06)` |
| `--border-default` | `border-border` | `rgba(237,234,226,0.09)` |
| `--border-strong` | `border-border-strong` | `rgba(237,234,226,0.15)` |

### 2.5 Semantic status — distinct from accent

| Token | Tailwind | Value | Use |
|---|---|---|---|
| `--success` | `text-success` etc. | `#74B98A` | Subscribed, enabled, saved, won |
| `--warning` | `text-warning` etc. | `#D97F3E` | Pending, degraded — **orange, NOT honey** |
| `--danger` | `text-danger` etc. | `#E06055` | Errors, destructive actions, lost |
| `--info` | `text-info` etc. | `#6F95C9` | Neutral information |

Badge pattern: `bg-{status}/15 text-{status}` + a `currentColor` dot. Never solid status fills.

### 2.6 Pipeline stage palette (user-pickable, tuned for graphite)

Defined in `PipelineStagesView.vue` picker and as tokens. Stage color appears ONLY as a dot,
a 2px card edge, or a chip — never as a card/column background.

| Name | Tailwind | Value |
|---|---|---|
| `--stage-blue` | `stage-blue` | `#6F95C9` |
| `--stage-amber` | `stage-amber` | `#D7A445` |
| `--stage-orange` | `stage-orange` | `#DD8046` |
| `--stage-green` | `stage-green` | `#74B98A` |
| `--stage-red` | `stage-red` | `#E06055` |
| `--stage-purple` | `stage-purple` | `#A78BC9` |
| `--stage-gray` | `stage-gray` | `#8F949C` |

> Stage colors saved in the DB are hex strings; legacy raw values (`#3B82F6`…) may exist in
> user data. Render whatever the DB holds; the *picker* offers only the palette above.

## 3. Typography

| Role | Family | Tailwind | Notes |
|---|---|---|---|
| UI | **Geist Variable** (`@fontsource-variable/geist`) | `font-sans` | Weights: 450 body, 500 UI labels, 600 headings/buttons |
| Data | **Geist Mono Variable** (`@fontsource-variable/geist-mono`) | `font-mono` | E-mails, amounts, dates, IDs, slugs, counts |

Rules:
- Body size is **14px** (`text-sm`); dense tables may use 13px (`text-[13px]` is allowed as a size, never as a color).
- **Every data value gets `font-mono`** with `tabular-nums` (already set via `font-feature-settings`/utility). This is the system's visual signature: data reads as data.
- Uppercase micro-labels (table headers, section eyebrows): 10–11px, `tracking-wider`, `text-text-muted`, weight 600.
- Headings differentiate by weight and size, never by color.

## 4. Shape, spacing, density

- **Radius:** cards/panels `rounded-xl`; controls (buttons, inputs, chips) `rounded-md`. Nothing else.
- **Table rows:** compact — `py-1.5 px-3.5` cells (~32px rows). CRM tables must scale to thousands of rows.
- **Page rhythm:** page header `mb-6`; card internal padding `p-4`/`p-5`; gaps `gap-2/3/4` — stay on the 4px grid.
- **No box-shadows** except the modal overlay scrim (`bg-black/60`). Elevation = lighter surface + border.

## 5. States — the 80% that makes it feel finished

Every interactive component MUST define: **hover, active, focus-visible, disabled, loading.**
Every data view MUST define: **loading (skeleton), empty (with a primary action), error (what happened + how to fix).**

- **Focus:** global honey ring — `:focus-visible { outline: 2px solid rgb(var(--accent)); outline-offset: 2px }`. Defined once in `style.css`; do not disable outlines anywhere.
- **Hover on dark:** things get *lighter* (`surface-hover`, `accent-hover`), never darker.
- **Disabled:** `opacity-40 pointer-events-none` — no color swap.
- **Empty states:** one sentence + one primary action (e.g. "No contacts yet" → `+ Add contact`), via the `EmptyState` component. Never a bare gray string.
- **Destructive actions:** always confirm via dialog; button label names the object ("Delete lead", not "Confirm").

## 6. Component conventions

Shared classes live in `apps/web/src/style.css` under `@layer components` — use them instead of
re-composing utilities:

| Class | Purpose |
|---|---|
| `.crm-card` | Panel-level card (`surface-panel`, border, `rounded-xl`) |
| `.crm-panel` | Alias kept for legacy — same look as `.crm-card` |
| `.btn-primary` | Honey CTA (`bg-accent text-accent-ink`, hover lightens) |
| `.btn-ghost` | Neutral secondary button |
| `.btn-danger` | Outlined danger button |
| `.crm-input` | Recessed input (`surface-input`) |
| `.crm-label` | Uppercase micro-label |
| `.crm-page-header`, `.crm-page-title` | Page heading row |
| `.crm-error`, `.crm-empty` | Error banner / empty state text |
| `.badge-high/-medium/-low` | Priority badges (danger/warning/neutral) |

**Component library:** headless only — **Reka UI** primitives (shadcn-vue pattern: components
live in the repo under `apps/web/src/components/ui/`, styled with tokens, combined with the
`cn()` helper from `src/lib/utils.ts`). Never install a styled component library
(PrimeVue, Vuetify, Element…).

Adopted so far:
- `AppModal` — Reka **Dialog** (focus trap/restore, Esc, scroll lock, aria). Pass `title`
  instead of rendering an `<h3>` in the slot.
- `ConfirmDialogHost` + `useConfirm()` — Reka **AlertDialog** for destructive actions.
  `await confirm({ title, message, confirmLabel: 'Delete stage' })` — never `window.confirm`.
- Plugin toggle — Reka **Switch** (`SwitchRoot`/`SwitchThumb` + `data-[state]` classes).
- `AppSelect` — Reka **Select** (prop-driven: `options` + `v-model`; options may carry
  a `color` dot). Replaced every native `<select>`.
- `AppCheckbox` — Reka **Checkbox** (honey when checked, slotted label). Replaced native checkboxes.
- `AppTooltip` — Reka **Tooltip** (needs `<TooltipProvider>` at the app root; the trigger
  still needs its own `aria-label` — a tooltip is not an accessible name).
- `EmptyState` — title + message + optional `icon`/`action` slots (§5).
  Use in a table's `#empty` slot (AppTable exposes one) or any empty list.
- `SkeletonRows` — token pulse blocks for list/card loading (tables use AppTable's own).
- `FormField` — label + control slot + inline error; the slot receives
  `fieldId` / `errorId` / `invalid` to wire `aria-describedby` and `aria-invalid`.

- `DropdownMenu` — Reka **DropdownMenu** (account menu, quick-create "+ New"). Includes a
  radio group (theme switch). Items carry `data-[highlighted]` styling.
- `AppPopover` — Reka **Popover**, the shared base for anchored panels. Same surface as
  `AppSelect`'s dropdown (`surface-elevated`, `border-border`, `shadow-2xl`, `z-[70]`).
- `AppCalendar` / `AppDatePicker` / `AppDateRangePicker` — Reka **Calendar** /
  **RangeCalendar** (ADR-0012). Model value is an ISO day string (`'2026-07-24'`), never a
  `Date`; the range picker carries presets (last 7/30/90 days, this / last month) and
  commits only a complete range. **Native `<input type="date|datetime-local|time|month|week">`
  is banned** — the browser draws its glyph and panel, so no token reaches them (that is why
  the old analytics filter had a black icon on graphite). `design-guard` rejects it.
  Month and weekday names come from Intl for the active locale — never from message files.

Next in line: Tabs.

### 6.1 App shell conventions (ADR-0008)

The shell (`components/shell/`) is a stable global frame filled by per-view slots. New
top-level views MUST follow this — otherwise the old duplication/misalignment returns:

- **Title is single-sourced.** Declare it in `route.meta.title` (+ `meta.parent` for nested
  routes). The top bar shows a **breadcrumb only on nested routes**; it never renders a title on
  top-level pages. Keep the page's own `<h2 class="crm-page-title">` in the content.
- **Page controls go through `<PageActions>`** — it teleports into the top bar's `#topbar-actions`
  slot. Never build a second title-or-actions bar in chrome.
- **Nav is declared once** in `apps/web/src/lib/nav.ts` (sidebar + command palette + Settings
  sub-nav read from it). Administration lives in the **Settings console** (`/settings/*`), not the
  main sidebar list.
- **Search / `⌘K` is navigation + quick-create only** — it does **not** search CRM records yet.
  Don't write copy implying it searches data until full-text search lands.

**Icons:** monochrome only, inherit `currentColor` (inline SVG, 16/20px grid — Lucide style).
Emoji are banned in chrome (nav, buttons, headers); allowed only inside user content.
Plugin nav items supply `navIcon` as emoji for backward compat — the shell renders them in
grayscale (see `AppLayout.vue`).

## 7. Motion

- Transitions: `transition-colors duration-150` on interactive elements. That's it.
- Panels/modals may use a 150–200ms fade/slide. No spring physics, no scroll effects.
- Respect `prefers-reduced-motion` (global rule in `style.css`).

## 8. Accessibility floor

- Contrast: text-primary/secondary on any surface ≥ 4.5:1; muted ≥ 3:1 (large/secondary only).
- Honey focus ring visible on every focusable element — keyboard path through every flow.
- Hit targets ≥ 32px. Tables keep header cells `<th scope="col">`.
- Status is never color-alone: dot + label text always together.

## 9. Theming — light / dark / system

Both themes ship from one token set; components never know which theme is active.

- **Dark is the default** (`:root`). **Light** is `:root[data-theme="light"]` in `style.css` —
  re-tuned values, not an inversion: paper surfaces, honey darkened to `#9A690F` for AA on
  white, hover states darken instead of lighten, `--accent-ink` flips to warm white.
- **Resolution:** `useTheme()` (`src/composables/useTheme.ts`) holds the preference
  (`system | light | dark`, localStorage key `crm-theme`), listens to
  `prefers-color-scheme`, and stamps `data-theme` on `<html>`. An inline script in
  `index.html` pre-paints the attribute before CSS loads — keep it in sync with the composable.
- **Switcher:** Settings → Appearance (three-state segmented control).
- **Rule:** never branch on theme in components (`v-if="isDark"` is banned) — if something
  looks wrong in one theme, fix the token value, not the component.
- White-label = overriding `--accent-*` per theme block.

## 10. Do / Don't quick reference

| Do | Don't |
|---|---|
| `text-text-muted` | `text-[#8a8f98]`, `text-gray-400` |
| `bg-accent/15` | `bg-[rgba(227,161,60,0.15)]` |
| `border-border` | `border-[rgba(255,255,255,0.08)]` |
| `text-warning` for "Pending" | honey/amber accent for warnings |
| `font-mono` on amounts/emails/dates | proportional digits in tables |
| Lighter surface on hover | darker hover, box-shadow elevation |
| Empty state with CTA | bare "No X found" text |
| Inline SVG `currentColor` icons | emoji in nav/buttons, multicolor icons |
| `AppDatePicker` / `AppDateRangePicker` | `<input type="date">` — the UA draws it, tokens can't |

## 11. Current status & roadmap

- [x] Token layer in `style.css` + `tailwind.config.ts` (2026-07-23)
- [x] Geist / Geist Mono self-hosted via Fontsource
- [x] Views swept of hardcoded hex/rgba (arbitrary values → semantic classes)
- [x] Global honey focus ring; grayscale plugin emoji in nav; monochrome SVG nav icons
- [x] Reka UI layer: Dialog (AppModal), AlertDialog (useConfirm), Switch; `cn()` util (2026-07-23)
- [x] Enforcement: design-guard script + CI `test:web` gate (guard + typecheck + vitest); `.claude/rules/web.md` (2026-07-24)
- [x] Reka Select (AppSelect), Checkbox (AppCheckbox), Tooltip (AppTooltip); all native
  selects/checkboxes replaced; Roles/Users deletes unified on useConfirm (2026-07-24)
- [x] EmptyState (CTA), SkeletonRows, FormField (inline validation) components + wired across
  Contacts/Forms/analytics/detail views + Settings password validation (2026-07-24)
- [x] Confirm dialog for stage delete via useConfirm; lead/user/role deletes unified (2026-07-24)
- [x] Light theme + system/light/dark switcher in Settings (2026-07-23)
- [x] App shell redesign: grouped sidebar + rail, global top bar with `#topbar-actions`
  contextual slot (`PageActions`), Settings console, breadcrumb titles (ADR-0008) (2026-07-24)
- [x] Command palette (Ctrl+K) — Reka Dialog; navigation + quick-create only (not data search) (2026-07-24)
- [x] Reka DropdownMenu adopted (account menu, quick-create). Tabs still on demand (2026-07-24)
- [x] Reka Popover (`AppPopover`) + date pickers (`AppCalendar`, `AppDatePicker`,
  `AppDateRangePicker`); analytics filter is one range picker with presets and auto-apply;
  native date inputs guard-banned; `color-scheme` set per theme (ADR-0012) (2026-07-25)

---

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system architecture, request flow, DB schema
- [AGENTS.md](../AGENTS.md) — conventions for AI coding agents
- [adr/0007-honey-graphite-design-system.md](./adr/0007-honey-graphite-design-system.md) — why this system
