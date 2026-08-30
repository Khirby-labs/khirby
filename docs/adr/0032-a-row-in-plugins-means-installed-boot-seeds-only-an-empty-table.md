# 0032 — A row in `plugins` means installed; boot seeds only an empty table

- **Status:** Accepted
- **Date:** 2026-08-18
- **Deciders:** Damian Orzeł

## Context

Until now the word "installed" carried no meaning in Khirby.
`PluginRegistryService.onModuleInit` walked every plugin the generated loader
returned and inserted a row with `enabled: true` for any that lacked one. Whatever
was baked into the image was therefore installed, and on, from the first boot.

That is fine for a fixed set of first-party plugins, and fatal for a marketplace:
a catalog needs a state meaning "this is present in the process but the operator
has not chosen it". Without that state every card is already installed and the
page has nothing to offer.

ADR-0030 anticipated this ("a future marketplace will install plugins at runtime")
and is the reason the public image bakes a default set in the meantime. ADR-0016
deferred UI-driven installation because reloading a Nest `DynamicModule` at
runtime is unsafe.

## Decision

**A row in the `plugins` table is the installation.** A plugin present in the
image with no row is *available*, not installed: its Nest module is still mounted
(`PluginsModule.forRoot` mounts unconditionally), but `isEnabled()` returns false,
so `PluginEnabledGuard` answers 503 for its routes and `emit()` skips it.

Boot no longer installs anything, with exactly one exception: **when the `plugins`
table is entirely empty**, it seeds the intersection of an explicit
`NATIVE_PLUGIN_NAMES` constant with the plugins this process actually loaded. A
fresh instance therefore comes up looking exactly as it did before the Marketplace
existed — six plugins, installed and enabled.

The seed condition is "the table is empty", **never "this plugin has no row"**.
The per-plugin form looks equivalent and is not: it would re-create, on the next
boot, every plugin an operator had removed, silently undoing their decision the
moment uninstall exists. The cost of the chosen form is that an operator who
empties the table by hand gets the native set back on the next start; that is
visible, recoverable, and far preferable.

The native set is a constant **in the code**, not a flag in the catalog and not
"everything the loader returns":

- *Everything the loader returns* would make every future plugin install itself on
  a fresh instance — precisely the opposite of what a marketplace is for.
- *A flag in the catalog* would tie the first boot to a document fetched over the
  network, so an instance without internet would come up with no plugins at all.

Installation is shared by three callers — boot's seed, `install()` and `enable()` —
through one `activate(plugin, row)` routine, which runs `onMigrate`, then builds the
context, then calls `onInit`. `onMigrate` runs **even when the row is disabled**:
the plugin's tables must exist before an operator later switches it on. Only the
context and `onInit` are gated on `enabled`.

Because the module is already mounted, `install()` loads no code — it writes a row
and builds a context. ADR-0016's ban on runtime `DynamicModule` reloading is
therefore untouched, while the operator still gets an install that takes effect
without a restart.

The seed insert uses `onConflictDoNothing` and then **adopts the winner's row**.
`docker-stack.yml` deploys with `order: start-first`, so two containers overlap and
both can see an empty table; `plugins.name` is unique. Bailing out on conflict
would leave the losing process with rows in the database and no in-memory context,
and `emit()` skips context-less plugins — that replica would drop every event in
silence, which is worse than the crash the guard prevents.

## Consequences

Easier: the Marketplace has a real state to show; installing is a database write
plus a context build, with no process restart and no module reloading; the three
installation paths cannot drift, because there is one `activate()`.

Harder: boot behaviour now depends on whether the table is empty, which is only
observable at process start — hence two separate specs for the two boot shapes,
and a third asserting that a conflicted seed still leaves a live context.

Newly true, and deliberately out of scope: two plugin controllers (Listmonk and
MCP) expose routes behind `SessionGuard` + `PermissionGuard` only, without
`PluginEnabledGuard`. Previously harmless — everything loaded was installed — they
will now serve requests for a plugin that is merely available. Closing that needs
its own task; it is recorded here rather than left for someone to rediscover.

An operator who truncates `plugins` gets the native set re-seeded on the next
start. That follows directly from the empty-table rule and is not a bug.

## Considered alternatives

- **Seed per plugin ("insert if this one has no row")** — rejected: it resurrects
  plugins the operator removed, and would quietly defeat uninstall when we add it.
- **Derive the native set from the catalog via a `preinstalled` flag** — rejected:
  it makes the first boot depend on a network fetch, so an air-gapped instance
  starts with nothing installed.
- **Treat everything the loader returns as native** — rejected: every plugin added
  later would then self-install on fresh instances, which is the behaviour this
  work exists to end.
- **Let the seed crash on a unique violation** — rejected: overlapping containers
  during a rolling deploy make that a normal event, not an exceptional one.
