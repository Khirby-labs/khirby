---
name: publish-plugin
description: >-
  Release first-party Khirby plugins (@khirby/plugin-*) to npm from
  Khirby-labs/plugins. Use when publishing a plugin, bumping a plugin version,
  adding a new first-party plugin, shipping Marketplace updates, or the user
  mentions npm publish of crm-plugin-*. Not for @khirby/plugin-sdk / plugin-host
  (those use tags in the CRM monorepo).
---

# /publish-plugin — ship `@khirby/plugin-*`

First-party plugins live in **[Khirby-labs/plugins](https://github.com/Khirby-labs/plugins)**
(local checkout: `plugins/` in the CRM repo). **Bump `package.json` version is the
release.** CI on `main` publishes versions that are not on npm. It never auto-bumps.

Author on that GitHub repo: **Patryk Najsarek** `<pat.najsarek@gmail.com>` (local
`user.email`, not global `bearly.pro`).

Do **not** publish `plugins/khirby__plugin-*` (Marketplace unpacks).

## New version of an existing plugin

1. Work in `plugins/crm-plugin-<slug>/` (the git checkout, not `khirby__plugin-*`).
2. Pick semver: **patch** (bugfix / parser), **minor** (compatible capability),
   **major** (breaking host/events/config).
3. Set `"version"` in that package's `package.json`. Do not bump siblings.
4. If `exports["./web"]` exists, `pnpm --filter @khirby/plugin-<slug> run build:web`
   must succeed. CI runs it before publish; `dist/` is gitignored.
5. Dry-run from the plugins repo root:

   ```bash
   ./scripts/publish-changed-plugins.sh --dry-run --since origin/main
   ```

   Expect `publish @khirby/plugin-<slug>@<new>` for the bumped package and `skip`
   for the rest. If you see `WARNING: … already on npm — bump package.json`, you
   forgot the bump.
6. Commit **only** that plugin (gmail author). Push `main` (or merge the PR).
7. Watch **Publish npm packages** on `Khirby-labs/plugins`. Secret: `NPM_TOKEN`.
8. Control Plane does not scrape npm on the public catalog. Open the plugin in
   CP admin (or `POST /v1/admin/plugins/:id/sync`) so `latestVersion` becomes the
   new semver. CRM Marketplace then shows Update (catalog cache up to 15 min).

Do not `npm publish` by hand unless CI is down. Do not tag like `plugin-sdk@…`.

## New first-party plugin

Directory `crm-plugin-<slug>/`, npm name `@khirby/plugin-<slug>`, `CrmPlugin.name`
`crm_<slug>`. First version **`1.0.0`**.

`package.json` must include:

- `"keywords": ["khirby-plugin"]`
- `"publishConfig": { "access": "public", "registry": "https://registry.npmjs.org" }`
- `"files"`: `"src"` (and `"dist"` when there is a Vue bundle)
- peers: `@khirby/plugin-sdk` `^1.0.0`; Nest plugins also `@khirby/plugin-host` `^1.0.0`
- relative imports of host packages in anything compiled into `apps/api/dist`
  (bare `@khirby/plugin-host` dies in the image)

If the plugin has Vue UI: `exports["./web"]` → `dist/web/entry.js` and a
`build:web` script. Marketplace install fails without that file in the tarball.

Then update the **CRM host** so checkout vs Marketplace still works (ADR-0045):

- `FIRST_PARTY_PLUGIN_DIRS` in `apps/api/src/modules/plugins/instance-plugins.loader.ts`
- `WORKSPACE_DIRS` (or equivalent) in `scripts/sync-plugin-deps.mjs`,
  `scripts/vendor-plugins-for-build.mjs`, `scripts/generate-plugin-loader.mjs`

And **Control Plane** so the catalog lists it:

- add a row to `apps/api/src/core/database/seed-khirby-plugins.ts` (`status: approved`,
  `packageName`, `manifest.id` = `crm_<slug>`), **or** submit from a registered instance.

Push `1.0.0` to plugins `main` → CI publishes. Sync npm in CP admin. Marketplace
install unpacks to `plugins/khirby__plugin-<slug>/`.

## Local dev vs Marketplace

`KHIRBY_PLUGINS_LOCAL=1` runs `crm-plugin-*` checkouts. Unset + restart loads the
unpack. The Update badge compares the CRM `plugins` row to CP `latestVersion`,
not the flag. Do not bump version on every commit — each npm version is a
Marketplace update.

## Host packages (not this skill)

`@khirby/plugin-sdk` / `@khirby/plugin-host`: `./scripts/publish-plugin-packages.sh khirby-plugins@x.y.z` in the CRM repo.
