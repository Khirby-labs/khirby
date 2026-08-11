# 0005 — Fastify HTTP adapter for NestJS

- **Status:** Accepted (backfilled)
- **Date:** 2026-07-23
- **Deciders:** Damian

## Context

NestJS runs on either the Express or the Fastify platform adapter. The choice is
mostly invisible to controllers but leaks at the edges: request typing, plugin
registration, and the session API surface differ between the two.

## Decision

The HTTP adapter is **Fastify**. Code at the platform boundary uses Fastify
primitives: `FastifyRequest` (not `express.Request`), `app.register()` for plugins
(not `app.use()`), and the async session API — `req.session.regenerate()` and
`req.session.destroy()` are awaited directly, with no callback.

## Consequences

- Higher throughput and lower overhead than Express, and first-class async
  lifecycle hooks.
- Edge code must not assume Express idioms; using `express.Request` or `app.use()`
  for plugin registration will fail or mis-type.
- **Use `FastifyRequest`, `app.register()`, and awaited async session methods.**
  This is the rationale behind the "Fastify vs Express" pitfalls in `AGENTS.md`.

## Considered alternatives

- **Express adapter** — rejected: larger per-request overhead and a callback-style
  session API; Fastify's performance and typed lifecycle fit better with no
  meaningful loss for this app.
