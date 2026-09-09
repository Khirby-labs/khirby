# 0046 — One instance secrets key (`KHIRBY_SECRETS_KEY`)

- **Status:** Accepted
- **Date:** 2026-09-09
- **Deciders:** Patryk
- **Pokelo ADR id:** `5868d616-08a3-4fd4-ace6-554788f282ec` (Khirby project)

## Context

Mailbox passwords, Google refresh tokens, the AI Compose LLM key, and the
Pokelo MCP token are each AES-256-GCM at rest. That started as three env vars
(`MAIL_SECRETS_KEY`, `AI_COMPOSE_SECRETS_KEY`, `POKELO_SECRETS_KEY`) because
plugins could not import `apps/api` (ADR-0016) and each copy of `*-crypto.ts`
read its own name.

Every new plugin that stored a secret added another operator key. Operators
already used the same 32 bytes in every slot. A fourth plugin would have meant
a fourth line in `.env`.

## Decision

We use **one instance key**: `KHIRBY_SECRETS_KEY` (32 bytes as hex or base64).

Encrypt/decrypt live on `@khirby/plugin-host` (`instance-secrets.ts`) so core
mail and Nest plugins share it without importing `apps/api`. First-party
plugins import the host by relative path (same rule as other host surface).

Legacy aliases still resolve, in this order: `KHIRBY_SECRETS_KEY`, then
`MAIL_SECRETS_KEY`, `AI_COMPOSE_SECRETS_KEY`, `POKELO_SECRETS_KEY`. Encrypt uses
the first configured key. Decrypt tries each distinct configured key so mixed
rows from the old names still open. An invalid `KHIRBY_SECRETS_KEY` is a hard
error even if an alias is valid.

Do not add a new `*_SECRETS_KEY` for a plugin. Point it at the instance helper.

## Consequences

**Easier:** one env line for a new instance; plugins stop duplicating AES-GCM.

**Harder:** published Marketplace copies of Pokelo / AI Compose still read only
their old env name until the next plugin npm release. Operators keep the aliases
until those packages ship, or run checkouts with `KHIRBY_PLUGINS_LOCAL` (ADR-0045).
Changing `KHIRBY_SECRETS_KEY` to a *new* value without keeping the old alias makes
existing ciphertext unreadable — set the global key to the bytes already in use.

Amends the env names in ADR-0014, ADR-0017, ADR-0018, and ADR-0024. Those
decisions otherwise stand (AES-256-GCM at rest, dedicated columns, no plaintext
on GET).

## Considered alternatives

- **Keep per-plugin keys** — rejected; operator cost grows with every plugin.
- **Derive per-plugin keys from one master** — rejected; extra complexity with
  no isolation benefit on a single-tenant instance.
- **Put crypto only in `apps/api`** — rejected; plugins must not import the app
  (ADR-0016). Host package is the shared surface.
