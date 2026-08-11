# @khirby/plugin-sdk

Interfaces and types for **Khirby** plugins (`CrmPlugin`, events, config schema,
`CreatePlugin`, `PluginWebEntry`).

## Install (external authors)

Published to **npm**. See [`.npmrc.example`](./.npmrc.example), then:

```bash
pnpm add @khirby/plugin-sdk
# Nest controllers also need:
pnpm add @khirby/plugin-host
```

In-monorepo consumers use `workspace:*` and TypeScript source (ADR-0006) — no
registry install required.

## Release (maintainers)

Bump `version` in this `package.json` (and `@khirby/plugin-host` if shipping both), then:

```bash
./scripts/publish-plugin-packages.sh crm-plugins@1.0.0
```

See [docs/PLUGINS.md](../../docs/PLUGINS.md) and ADR-0016.
