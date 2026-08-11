# 0007 — "Honey & Graphite" design system with CSS variable tokens and headless UI

- **Status:** Accepted
- **Date:** 2026-07-23
- **Deciders:** Damian Orzeł (direction picked from three proposals), Claude

## Context

The web UI was a competent but anonymous Linear clone: accent `#5e6ad2` and background
`#08090a` copied 1:1, Inter, dark-only, with ~300 hardcoded hex/rgba values spread across
24 Vue files in Tailwind arbitrary-value classes. Two styling dialects had already diverged
(`text-[#8a8f98]` vs `text-neutral-200`), there was no path to a light theme or white-label,
and the amber accent question (brand vs warning) was unresolved. Three design directions
were proposed and compared on live previews; the user picked K2 ("Honey & Graphite") with
the token architecture of K3 underneath.

## Decision

We adopt the **"Honey & Graphite"** design system, specified in `docs/DESIGN-SYSTEM.md`:

1. **All colors are CSS variables** in `apps/web/src/style.css` (RGB triplets), mapped to
   semantic Tailwind utilities in `tailwind.config.ts`. Views never hardcode color values
   and never use Tailwind's built-in palette.
2. **Honey amber (`#E3A13C`) is the brand accent**, restricted to CTA / focus / selection /
   active-nav. Warnings are a distinct orange (`#D97F3E`). Elevation = lighter surface, no shadows.
3. **Typography:** Geist + Geist Mono (self-hosted via Fontsource); mono for all data values.
4. **Component layer is headless-only:** Reka UI primitives via shadcn-vue copied into
   `apps/web/src/components/ui/`. No styled component libraries.

## Consequences

- Easier: light theme and white-label become a token-block swap; agents have one spec
  (`docs/DESIGN-SYSTEM.md`) to follow; visual drift between views stops; a11y improves
  (global honey focus ring, monochrome `currentColor` icons).
- Harder: every new UI change must go through tokens — quick hardcoded hexes will be
  rejected in review; shadcn-vue components must be restyled on adoption rather than
  used as-shipped.
- **Rule for agents:** do not "fix" the UI back to Tailwind palette colors, do not
  reintroduce arbitrary hex classes, and do not install styled UI libraries. The banned
  patterns and their replacements are tabled in `docs/DESIGN-SYSTEM.md` §10.
- Legacy stage colors (`#3B82F6`…) may persist in existing DB rows; the picker offers only
  the new graphite-tuned palette (`docs/DESIGN-SYSTEM.md` §2.6) and seeds use it for new installs.

## Considered alternatives

- **K1 "Kartoteka" (light, paper + spruce green)** — highest readability, but inverts the
  theme the team already works in; highest migration cost.
- **K3 "Sygnał" (achromatic chrome, color = data only)** — most systematic; rejected as the
  full direction for lacking a distinct brand voice, but its token architecture was kept.
- **Styled component libraries (PrimeVue, Naive, Vuetify, Element Plus)** — rejected: each
  imposes its own look that would fight the design system; overriding themes costs more
  than styling headless primitives.
- **No component library (hand-rolled overlays)** — rejected: correct focus traps, aria,
  and positioning for dialogs/dropdowns/toasts are weeks of work and a recurring bug source.
