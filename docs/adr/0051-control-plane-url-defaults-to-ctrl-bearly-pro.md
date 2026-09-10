# 0051 — Unset CONTROL_PLANE_URL defaults to ctrl.bearly.pro

- **Status:** Accepted
- **Date:** 2026-09-10
- **Deciders:** Patryk
- **Pokelo ADR id:** `124ed32e-d775-4aaa-b06a-e8946512e2f4` (Khirby project)
- **Amends:** [ADR-0044](0044-control-plane-telemetry-and-marketplace-client.md)

## Context

ADR-0044 gated all Control Plane traffic on `CONTROL_PLANE_URL` and treated
**unset and empty the same**: no outbound calls, empty marketplace, register
fails. A self-hosted instance then had no catalog or telemetry until the
operator discovered and set that variable — including Bearly's own production
Control Plane at `https://ctrl.bearly.pro`.

Opting out of **heartbeats** is already `DISABLE_TELEMETRY`. Opting out of
Control Plane entirely should stay possible, but it should not be the default.

## Decision

When `CONTROL_PLANE_URL` is **unset**, the client uses **`https://ctrl.bearly.pro`**
(trailing slash stripped). An **explicit empty** value still disables outbound
Control Plane calls (heartbeat/catalog soft-fail, register errors), as in ADR-0044.

## Consequences

Easier: Marketplace and telemetry work on a stock image without extra env.
Operators override the URL for a self-hosted Control Plane.

Harder: a forgotten empty `CONTROL_PLANE_URL=` in compose still opts out; do
not treat unset as empty. Agents must not revert the default to "no CP until
configured".

## Considered alternatives

- **Keep unset = disabled** — rejected; production catalog would stay empty by
  default.
- **No empty opt-out** — rejected; air-gapped installs still need a way to
  skip outbound CP without standing up a dummy host.
