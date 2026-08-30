# 0033 — Marketplace is the one discovery surface allowed in the primary sidebar

- **Status:** Accepted
- **Date:** 2026-08-18
- **Deciders:** Damian Orzeł

## Context

ADR-0008 designed the navigation shell and, among its considered alternatives,
recorded this rejection verbatim:

> **Promote Users/Roles/Plugins to primary nav to save a click** — rejected: it
> leaks the admin surface into the daily workspace and unbalances the list; a
> self-hosted-tool tell.

The Marketplace needs a place to live. Putting it under `/settings/*` with the
other administrative screens would honour that rejection literally — and would
also hide the one page whose entire purpose is to be found by someone who does not
yet know it exists. An operator does not go looking in Settings for a feature they
have never heard of.

Without an explicit decision, the next person to read `.claude/rules/web.md`
("Admin surfaces live in the Settings console, not the main sidebar") will see the
sidebar entry as a regression and remove it.

## Decision

**Marketplace gets its own sidebar section — `Extensions` / `Rozszerzenia` —
between the Workspace group and the plugin routes.** It is the single exception to
ADR-0008's rejection, and the exception is drawn on a stated line:

*Administration is operating what you already have. Discovery is finding out what
you could have.* Users, Roles and Settings → Plugins are administration and stay in
the Settings console. The Marketplace is discovery: its value is proportional to
how easily it is stumbled upon, which is exactly the property the Settings console
is designed to deny.

**The rest of ADR-0008 stays in force.** Specifically: the top bar still carries no
page title on top-level pages, the view keeps its own `<h2 class="crm-page-title">`,
page controls still go through `<PageActions>`, and Users/Roles/Plugins remain in
the Settings console. This ADR overturns one bullet, not the shell.

The section renders unconditionally, unlike the plugin group, which appears only
when some enabled plugin contributes a route. On a fresh instance no plugin does —
and that is precisely the state in which an operator most needs the catalog.

**Marketplace does not configure anything.** ADR-0023 places plugin configuration
in the disclosure panel of Settings → Plugins, and duplicating that form here would
create two editors for one row. An installed card therefore links to
`/settings/integrations` instead. This is also what keeps the split above honest:
the Marketplace hands over at exactly the point where discovery ends and
administration begins.

The entry joins the existing `navigate` group of the ⌘K palette rather than
receiving a fourth group of its own — the palette groups by what an entry does (go
somewhere, create something, open a plugin page), and a one-item group would be
heading chrome wrapped around a single line.

## Consequences

Easier: an operator discovers plugins without being told the page exists;
`.claude/rules/web.md` now states the boundary rather than implying that every
non-workspace surface belongs in Settings.

Harder: the sidebar has one more permanent section, so the "admin surfaces do not
belong here" rule can no longer be applied mechanically — it needs the
discovery/administration distinction above. Anyone adding a second sidebar section
must argue against this ADR, not merely cite the precedent.

The SPA does not know the session's permissions, so the entry is visible to users
without `integrations:manage`; the API answers 403 and the view renders an error
banner naming the missing permission. Hiding nav by permission is a separate piece
of work and is not started here.

## Considered alternatives

- **`/settings/marketplace`, inside the Settings console** — rejected: consistent
  with ADR-0008 and self-defeating, since a discovery surface that must already be
  known about discovers nothing.
- **An entry in the Workspace group** — rejected: it is not daily work, and it
  would push the operational items down the list, which is the "unbalances the
  list" objection ADR-0008 raised.
- **A ⌘K entry and no sidebar item** — rejected: the palette is for people who know
  what they are looking for.
- **A fourth palette group for Extensions** — rejected: one item under its own
  heading is chrome, not structure.
