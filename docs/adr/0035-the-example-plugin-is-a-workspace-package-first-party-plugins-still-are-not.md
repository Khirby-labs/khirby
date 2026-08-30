# 0035 — The example plugin is a workspace package; first-party plugins still are not

- **Status:** Accepted
- **Date:** 2026-08-18
- **Deciders:** Damian Orzeł

## Context

ADR-0030 moved first-party plugins to npm and, with it, established that they are
**not** workspace packages of this repository: `plugins/` is an optional checkout,
the lockfile must stay valid for a tree that does not contain it, and the image
vendors plugin sources from `node_modules` at build time.

The Marketplace breaks on that arrangement for a different reason. All six shipped
plugins belong to the native set, so on a fresh instance every card is already
installed — there is nothing to click. The install path cannot be demonstrated, or
even manually verified, without a seventh plugin that is deliberately *not* native.

`examples/crm-plugin-hello` has been in the tree for a while: a complete plugin with
a `CrmPlugin` class, a Nest controller, a Vue view and a `createPlugin()` factory,
marked `private: true`. Nothing loaded it — it was in neither
`plugins.manifest.json` nor `pnpm-workspace.yaml`.

## Decision

**`examples/*` joins the workspace globs, and the example plugin is registered in
the manifest as a `local` entry.** ADR-0030's prohibition is narrowed to what it was
actually about: *published* first-party plugins, which must keep resolving from npm
so the lockfile stays valid without `plugins/`.

The example is a different kind of thing, and the difference is what makes the
exception safe rather than convenient:

- It is **`private: true` and never published**, so there is no registry version
  that a workspace link could contradict.
- It is **tracked in git**, so it is present in every checkout — CI, image build,
  and a developer's clone alike. `plugins/` is present in none of them by default.
- It exists **to be test material**. Its only job is to make the install path
  demonstrable and to keep a `contact.created` handler honest.

A manifest entry with `"local": "<path>"` is read explicitly by the three sync
scripts instead of being inferred:

- `sync-plugin-deps.mjs` resolves it to `workspace:*` **unconditionally**, not
  gated on `KHIRBY_PLUGINS_WORKSPACE` (which governs only the optional `plugins/`
  checkout). A semver range would send CI's frozen install to the registry for a
  package that does not exist there.
- `vendor-plugins-for-build.mjs` skips it — its sources are already in the tree,
  and the fallback naming would have produced a doubled-prefix directory.
- `generate-plugin-loader.mjs` emits a relative specifier to `<local>/src`, and
  throws if the declared path has no `package.json`.

**Anything compiled into `apps/api`'s output imports host packages by relative
path, not by bare specifier.** `nest build` is plain tsc and rewrites nothing, and
the runtime image ships only the build output plus each package's `package.json` —
so a value import of `@khirby/plugin-host` emits a `require()` that resolves to a
directory containing no sources, and the API dies at boot with `MODULE_NOT_FOUND`.
Typecheck, lint, the full test suite and even `docker build` all pass. The
first-party plugins already follow this convention; the example now does too. A
plugin published to npm and installed by an operator legitimately does the
opposite, because npm gives it a real `node_modules` entry.

## Consequences

Easier: the Marketplace has exactly one installable card on a fresh instance, so
the whole path — available card, install, event handler firing without a restart —
can be walked by hand and demonstrated. The fixture's own spec now runs, because
Jest `roots` cover `examples/`.

Harder: the lockfile gains an importer, and four Dockerfiles gain `COPY` lines in
every stage that installs or builds. Adding a workspace package is the mirror image
of the 2026-08-07 incident where retiring one broke the image build before any test
ran, and it must be verified the same way — by building the image, not by trusting
the test suite.

Because `docker.yml` builds images only on `v*.*.*` tags, nothing in the PR pipeline
would catch a mistake in this area. The image build and a module-resolution check
inside the built image are therefore part of the work, not optional extras.

This ADR licenses `examples/*`, nothing wider. A first-party plugin that wants to be
a workspace package still has to argue against ADR-0030.

## Considered alternatives

- **Move the fixture into `plugins/`** — rejected: that directory is gitignored and
  excluded from the image, so the fixture would not exist where it is needed.
- **Publish the fixture to npm and consume it like the others** — rejected: it
  would put demonstration material in the public registry and make a test change a
  release.
- **Let the loader fall back to the bare package name** — rejected: that specifier
  resolves in a workspace checkout and fails in the image, so the two environments
  would disagree and only the release build would find out.
- **Ship no installable plugin in V1** — rejected: it leaves the central claim of
  the feature — install without a restart — unverifiable by anyone.
