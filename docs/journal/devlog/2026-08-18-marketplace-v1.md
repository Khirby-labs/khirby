# docs/journal/devlog/2026-08-18-marketplace-v1.md
Issue:    KBY-103 (Linear), with sub-issues KBY-104…109 · branch dorzel/kby-103-marketplace-pluginow-katalog-i-instalacja-jednym-klikniecie

Goal:     Plugin Marketplace V1 — a catalog page with one-click install, and the
          install semantics underneath it. All six sub-issues on one branch/PR.

Done:     `plugins` row now MEANS installed (ADR-0032). Boot stopped inserting
          unconditionally; only an entirely empty table seeds NATIVE_PLUGIN_NAMES ∩
          registry. registerPlugin split into syncInstalledPlugin + a shared
          activate() reused by install() and enable(). New marketplace module:
          versioned catalog document (remote + in-image fallback), per-request
          status resolution, GET list/one + POST install on integrations:manage.
          examples/crm-plugin-hello wired into the workspace as the one installable
          fixture. Web: /marketplace card grid, category filter, details modal, own
          sidebar section (ADR-0033), ⌘K entry, pl+en copy. ADRs 0032–0035.
          api 40 suites/390 tests → 44/473; web 33 files/254 → 35/277.

Why so:   The seed condition is "table is empty", never "this plugin has no row" —
          the per-plugin form silently resurrects anything an operator removed. The
          native set is a code constant, not a catalog flag (a first boot without
          internet would come up empty) and not "everything the loader returns"
          (every future plugin would self-install, the opposite of a marketplace).
          Install loads no code — the Nest module is already mounted, only the row
          and the in-memory context move — which is how it takes effect without a
          restart while ADR-0016's ban on runtime DynamicModule reloading holds.
          The 15-min cache holds the catalog DOCUMENT only; statuses are recomputed
          per request, or a freshly installed plugin reads "available" for a quarter
          of an hour in production with every spec still green. Failed fetches are
          cached 60s too, else a down remote repays the 3s timeout on every request.
          Response set is a union with installed rows, so a remote catalog omitting
          a native plugin doesn't make six cards vanish. See ADR-0034.

Failed:   - The fixture imported `@khirby/plugin-host` by bare specifier. That is a
            VALUE import, tsc emits the specifier verbatim, and the runner ships
            only build output plus each package's package.json — so it resolved to
            a sources-free directory and the API died at boot with MODULE_NOT_FOUND.
            Typecheck, lint, 473 tests and `docker build` ALL passed. Found only by
            requiring the module inside the built image. docker.yml builds images on
            v*.*.* tags only, so this would have first broken at release tagging.
            Fix: relative import, like the first-party plugins already use.
          - Boot seeding with plain onConflictDoNothing looked correct and was
            worse than the crash it prevented: a no-op insert returns no row, so the
            losing replica of a start-first deploy would have had rows and NO
            in-memory context, and emit() skips context-less plugins — every event
            dropped in silence. Fix: adopt the winner's row and activate anyway.
          - list() read the plugins table twice (findAll + listAvailable). An
            install committing between the two SELECTs made the answers disagree and
            rendered two cards for one plugin, one still offering Install. Fix:
            snapshot() derives both from one read.
          - Wrote marketplace.errors.forbidden/load, had them translated, gave them
            context notes — and referenced them nowhere; the store kept the server's
            English e.message. A Polish operator read English. The spec only asserted
            the banner EXISTED, which is why it shipped past every gate. Fix: store
            holds a reason code, view maps it to a key at render.
          - Listing a .ts file in I18N_ENFORCED does nothing — the ratchet parses
            <template> only. It implied a guarantee that helped hide the above.
          - `node -e` with a multi-line program silently wrote nothing: the Volta
            shim truncates each argument at its first newline (already in INCIDENTS
            for adr-publish.sh; it bit again here). Use a script file.
          - A sed-driven Dockerfile patch REPLACED `COPY scripts ./scripts` instead
            of adding beside it, which would have broken three image builds. Caught
            by reading the diff, not by the exit code.
          - The copywriter shortened card.disabled to "Disabled"/"Wyłączona",
            dropping the word the key exists to carry: that badge marks a plugin
            that IS installed, and re-installing is impossible. Restored, and the
            context note now says the redundancy is deliberate.

Next:     Listmonk and MCP controllers don't use PluginEnabledGuard, so they now
          serve routes for an available-but-not-installed plugin (recorded in
          ADR-0032, out of scope here). Uninstall from the UI. Hiding nav entries by
          session permission. Publishing a real catalog document to the landing site
          and setting MARKETPLACE_CATALOG_URL.

Verify:   pnpm verify ✅ — typecheck clean (apps/api, apps/web, 5 packages), eslint
          clean, design-guard OK, i18n-guard OK (pl/en parity across 17 namespaces,
          47 migrated files, keys in plugins/packages/examples all resolve);
          api 44 suites/473 tests, web 35 files/277 tests, forms-client 3/17,
          forms-ui 1/3. [verify] GREEN — marker written.
          Runtime, against the production image + live Postgres/Redis, one PID:
          empty table seeded exactly 6 (fixture absent) → UI install flipped the
          card with no reload → contact.created logged with no restart between;
          restart re-seeded nothing and made no duplicates; anonymous GET 401;
          install 201 / 409 / 404; unreachable catalog 200 from the in-image copy
          with exactly one warning across three requests.
