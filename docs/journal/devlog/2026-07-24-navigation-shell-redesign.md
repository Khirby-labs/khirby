# 2026-07-24 · navigation-shell-redesign

Issue:    — (ad-hoc, from a design audit) · branch worktree-shell-redesign
Goal:     redesign the app shell (sidebar + top bar) — "ani równe ani ładne"
Done:     new shell on Honey & Graphite tokens — 18 files, +1229/−276, web gate green
          - sidebar: header aligned to h-12 (was 62px → fixed 14px corner gap), Workspace/Plugins
            groups, footer pinned, rail (icon) collapse persisted, Reka DropdownMenu account menu
          - top bar: global Search ⌘K + "+ New", #topbar-actions contextual slot via <PageActions>,
            breadcrumb only on nested routes (single-sourced title)
          - command palette ⌘K (Reka Dialog, filterable, keyboard-driven)
          - Settings console (/settings sub-nav); Users/Roles/Plugins moved under it, old paths redirect
          - central nav model in lib/nav.ts; +8 tests (nav helpers, ui store) → 30 green
Why so:   see ADR-0008. Title lives in the view's <h2>; the top bar shows a breadcrumb only when
          nested, so it never duplicates the heading (that duplication, D2, was the trigger).
          Admin sinks into Settings so the main list stays purely operational (frequency tiers).
Failed:   first cut of SidebarLink used a dynamic `:is="collapsed ? AppTooltip : Fragment"` with a
          functional Fragment — fragile under vue-tsc; replaced with a plain v-if/v-else split.
          Considered migrating every view's header to <PageActions>; scoped to the 3 Workspace views
          to bound risk (no view tests existed to catch regressions) — pattern set for the rest.
Next:     - SEARCH IS NAV-ONLY. ⌘K navigates + quick-creates; it does NOT search contacts/deals/
            forms data. Full-text search over records is the real follow-up — don't ship copy that
            implies the box already searches data.
          - migrate remaining views (analytics, detail, stages, newsletter) to <PageActions>
          - UsersView still renders its own "Users" heading while the sub-nav says "Members" — unify
          - branch is unmerged; nothing committed yet
Verify:   lint:design ✅ · typecheck:web ✅ (vue-tsc clean) · test:web ✅ 30/30
          (verified live in Playwright: dark+light, ⌘K, Settings console, rail — no console errors)
