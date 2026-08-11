# 0008 — Navigation shell: grouped sidebar, global top bar with contextual slot, command palette

- **Status:** Accepted
- **Date:** 2026-07-24
- **Deciders:** Damian Orzeł, Claude

## Context

The app shell (`AppLayout.vue`) had grown misaligned and unstructured. Concrete defects,
measured on the live app: the sidebar logo header was 62px while the top bar was 48px, so the
two borders meeting in the top-left corner were 14px out of line; the top bar carried only a
tiny uppercase page title that **duplicated** each view's own `<h2>`; the nav was one flat list
that mixed daily work (Contacts/Pipeline/Forms) with administration (Roles/Users/Plugins/
Settings) and a plugin route; and the account area was plain `email + "Sign out"` text floating
mid-column. In short: "ani równe, ani ładne". A redesign proposal was reviewed and approved
before implementation.

## Decision

We restructure the shell into a stable global frame plus per-view contextual slots, on the
existing "Honey & Graphite" tokens (ADR-0007) and Reka UI primitives:

1. **Sidebar is frequency-tiered.** A `Workspace` group (Contacts, Pipeline, Forms) on top; a
   labeled `Plugins` group for dynamic plugin routes (never interleaved with first-party nav);
   a footer **pinned to the bottom** with Settings and the account menu. The header is exactly
   `h-12` (48px) to meet the top bar's border. Collapses to an icon **rail** on desktop
   (preference persisted in `localStorage`); tooltips supply labels when collapsed.
2. **Administration lives in a Settings console, not the main list.** `/settings` renders
   `SettingsLayout` with its own sub-nav (General / Members / Roles / Plugins). Users, Roles and
   Plugins management moved under `/settings/*`; the old `/users`, `/roles`, `/plugins` paths are
   kept as redirects for back-compat and deep links.
3. **The top bar is a global frame with a contextual slot.** It always carries global search
   (`⌘K`) and `+ New` (quick-create). A `#topbar-actions` teleport target is filled per-view via
   the `<PageActions>` component. The page **title is single-sourced**: the bar shows a breadcrumb
   only on nested routes (from `route.meta.title` / `route.meta.parent`), so it never repeats a
   view's own heading. The nav model is declared once in `apps/web/src/lib/nav.ts`.
4. **Command palette (`⌘K`) is the primary navigation.** A Reka Dialog with a filterable,
   keyboard-driven list (Navigate / Plugins / Create). It **navigates and creates only** — it is
   *not* a full-text search over CRM data yet (see Consequences).

## Consequences

- New top-level views MUST follow the shell conventions (also in `.claude/rules/web.md`): declare
  the title via `route.meta`, inject page controls through `<PageActions>` (do not render a title
  in chrome), and source nav entries from `lib/nav.ts`. Reintroducing a per-page title into the
  top bar reintroduces the duplication this ADR removed — don't.
- Quick-create routes to the owning view with `?new=1`; the view opens its create dialog. Adding
  a new "New X" means wiring that query in the target view, not cross-component plumbing.
- **Search is navigation-only.** The `⌘K` palette does not query contacts/deals/forms data. A
  future full-text search is deliberately out of scope here; until it lands, do not describe the
  search box as searching records.
- Emoji are gone from the sidebar (plugin nav uses the monochrome `plugins` glyph), consistent
  with DESIGN-SYSTEM.md §6; distinct plugins therefore share one icon, differentiated by label.
- Migration is partial by design: the three Workspace views adopt `<PageActions>`; other views
  keep in-page action rows for now. The pattern is established for incremental adoption.

## Considered alternatives (optional)

- **Keep the title in the top bar on every page** — rejected: it duplicates each view's `<h2>`,
  the exact defect (D2) that triggered the redesign.
- **Promote Users/Roles/Plugins to primary nav to save a click** — rejected: it leaks the admin
  surface into the daily workspace and unbalances the list; a self-hosted-tool tell.
- **cmdk-style dedicated library for the palette** — rejected: Reka Dialog + a small keyboard
  model keeps us on the headless-only rule (ADR-0007) with no new dependency.
