# @khirby/plugin-host

Stable Nest surface for Khirby plugins: session/RBAC guards, `PluginEnabledGuard`,
`DB_TOKEN`, `AppException`, host service injection tokens, and instance AES-256-GCM
helpers (`encrypt` / `decrypt` keyed by `KHIRBY_SECRETS_KEY`, ADR-0046).

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
./scripts/publish-plugin-packages.sh plugin-host@1.2.0
# or khirby-plugins@x.y.z to publish sdk + host together
```

Docs: [Host API](https://khirby.com/docs/plugins/host) · [Create a plugin](https://khirby.com/docs/plugins/create)

Instance-volume plugins (not `tsc`-compiled) load Nest via
`loadVolumeNestModule` from `@khirby/plugin-host/volume-nest`. Published npm
plugins import the Nest class in `getNestModule()` instead.
