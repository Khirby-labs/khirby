# 0034 — The catalog is a versioned remote document with an in-image fallback

- **Status:** Accepted
- **Date:** 2026-08-18
- **Deciders:** Damian Orzeł

## Context

The Marketplace needs to know what exists. The metadata a plugin instance carries —
name, version, optional description — is enough for an administrative list but not
for a catalog: there is no category to filter by, no vendor, no link to
documentation.

The more consequential question is where that description comes from. If the
catalog is compiled into the image, then adding a plugin means releasing a new
version of the CRM, and the marketplace stops being a distribution channel. If it
is fetched, then every instance depends on a network document being reachable,
well-formed and trustworthy.

## Decision

**The canonical catalog is a versioned JSON document fetched from
`MARKETPLACE_CATALOG_URL`. The copy compiled into the image is the fallback.** The
remote format is canonical from day one even though V1 lists only our own plugins,
so that adding a plugin later needs no CRM release.

**The in-image copy is a TypeScript module, not a JSON file.** `apps/api` does not
enable `resolveJsonModule`, `nest-cli.json` declares no assets, and the runtime
image copies only the build output — a `catalog.json` would typecheck, pass every
test, and be absent in production. As a module it compiles into `dist` with
everything else.

**The catalog carries metadata only.** Names and descriptions come from the plugin
instance, by the same literal-plus-message-key route Settings uses (ADR-0011).
Putting copy in the catalog would create two sources for one string, and they would
diverge at the first edit.

**Validation rejects the whole document or accepts the whole document.** An unknown
major version, a `category` outside the closed set, an unknown `icon`, a duplicate
`name`, a non-https `docsUrl`, a wrong content type, an oversized body, unparsable
JSON — any one of these discards the entire remote document and falls back to the
in-image copy with a single warning line. Admitting the entries that happen to parse
would yield a catalog that looks correct on screen and silently loses positions,
which is much harder to notice than a fallback. *This overrides the acceptance
criterion in KBY-105 that made a non-https `docsUrl` reject only its own entry: the
same issue forbids admitting half a document, and the whole-document rule is the
half of that pair worth keeping.*

**Unknown extra fields on an entry are ignored, not rejected.** The first format
change made for community plugins must not blind every deployed instance still
reading its own copy.

**Availability is a filter, and the response is a union.** An entry naming a plugin
this image does not contain is hidden, with a log line, because its install button
could not work. Conversely an installed plugin the catalog does not describe is
still shown — under category `other`, with no vendor and no docs link — because
removing it would make six familiar cards vanish the moment a remote catalog
omitted them, which reads as data loss rather than as filtering.

**With `MARKETPLACE_CATALOG_URL` empty or unset, no network request is made at
all** and the in-image copy is used directly, with no warning: that is the normal
single-instance configuration, not a degraded one.

**Caching is per process and covers both outcomes.** A validated document is held
for 15 minutes; a failed or timed-out fetch is held for 60 seconds. The negative
half is not an optimisation — without it a remote that is down would repay the full
3-second timeout on every request, so the page would feel broken while technically
still answering.

**The cache holds the document, never the resolved statuses.** `status` and
`enabled` are recomputed from the database on every request. Caching the enriched
response would leave a plugin the operator had just installed reading `available`
for the rest of the window — in production only, with every test still green.

Because the cache lives in process memory, a second replica would keep its own.
`docker/docker-stack.yml` pins `replicas: 1`, so this is currently free; if that
ever changes, the consequence is a bounded staleness difference between replicas,
not incorrectness. Recorded here so it is a known trade rather than a discovery.

Nothing is fetched at boot: the first request triggers the first fetch, so a slow
or unreachable catalog can never delay application start.

## Consequences

Easier: a new plugin reaches existing instances by publishing a document, with no
CRM release; an air-gapped instance works unchanged; a hostile or broken remote
document degrades to the shipped copy instead of an error page.

Harder: two sources of truth exist for the same list, so "which catalog am I
looking at?" becomes a real question — answered by the single warning line in the
log. The 15-minute window means a catalog change is not immediately visible.

The size cap, content-type check and https requirement are V1 defences for content
that is ours today and third-party in V2. They are cheap now and would be awkward
to retrofit once instances are already fetching.

## Considered alternatives

- **Catalog compiled into the image only** — rejected: every new plugin would
  require a CRM release, which removes the point of a marketplace.
- **Catalog rows in the database** — rejected: the catalog is a document describing
  what exists, not state this instance owns; storing it invites edits that the next
  fetch would overwrite.
- **Accept the valid entries of an invalid document** — rejected: silently losing
  positions is worse than visibly using the fallback.
- **Cache the enriched response** — rejected: it makes a freshly installed plugin
  read as available for up to fifteen minutes, and no test would ever catch it.
- **Put plugin names and descriptions in the catalog** — rejected: two sources for
  one string, guaranteed to diverge.
