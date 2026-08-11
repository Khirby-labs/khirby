# @khirby/plugin-host

Stable Nest surface for Khirby plugins: session/RBAC guards, `PluginEnabledGuard`,
`DB_TOKEN`, `AppException`, and host service injection tokens.

Community plugins must import from this package and `@khirby/plugin-sdk` only — never
from `apps/api` (ADR-0016).

## Install

Same **npm** registry as `@khirby/plugin-sdk` — see
[`../plugin-sdk/.npmrc.example`](../plugin-sdk/.npmrc.example).

```bash
pnpm add @khirby/plugin-host @khirby/plugin-sdk
```

## Release

```bash
./scripts/publish-plugin-packages.sh crm-plugins@1.0.0
# or plugin-host@1.0.1 alone
```
