# 0045 — Local checkout plugins preferred over Marketplace unpacks

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** Patryk
- **Pokelo ADR id:** `74c0c7a5-fafb-4603-a06e-aac9ad0005e3` (Khirby project)

## Context

The public image ships an empty `plugins.manifest.json` (ADR-0044). First-party
plugins arrive as Marketplace npm unpacks under `plugins/khirby__plugin-*`.
A Khirby-labs/plugins git checkout still lands next to them as `plugins/crm-plugin-*`.

Boot **skips** those first-party directory names (ADR-0039) so a checkout is not
accidentally treated as a volume install. The running process therefore always loads
the Marketplace copy, even when the operator is editing the checkout. That made
local plugin work (e.g. Pokelo MCP contract drift) look like “the plugin is
broken” while the edited sources never ran.

`KHIRBY_PLUGINS_WORKSPACE` (ADR-0037) only skips the **vendor** step. It does not
change which volume package boot loads.

## Decision

We add **`KHIRBY_PLUGINS_LOCAL`** (`1` / `true` / `yes`). When set, boot loads
`plugins/crm-plugin-*` checkouts and **skips** a Marketplace unpack of the same
`CrmPlugin.name`. Default is off (production / empty image unchanged).

Uninstall, `findInstanceLocalDirForPlugin`, and scaffold still treat first-party
directory names as reserved: Marketplace remove must not delete a git checkout.

## Consequences

**Easier:** `pnpm dev` with a plugins checkout runs the sources you edit.
Marketplace rows stay installed; only the **code** source switches.

**Harder:** a checkout that fails to load (`web_bundle_required`, missing
`createPlugin`) does not fall back silently to the unpack — fix the checkout or
unset the flag. Agents must not turn this on in production images or treat
`KHIRBY_PLUGINS_WORKSPACE` as the same switch.

## Considered alternatives

- **Reuse `KHIRBY_PLUGINS_WORKSPACE`** — rejected; vendor skip and boot source
  are different jobs (ADR-0037 vs this).
- **Always load checkouts when `plugins/.git` exists** — rejected; an operator can
  have a checkout and still want the published unpack.
- **Make uninstall prefer the checkout dir** — rejected; that would `rmSync` a
  git working tree.
