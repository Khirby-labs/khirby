# 0002 — Redis-backed session cookies, not JWT

- **Status:** Accepted (backfilled)
- **Date:** 2026-07-23
- **Deciders:** Damian

## Context

The CRM is a single-tenant app with a Vue 3 SPA talking to a NestJS API on the
same origin (nginx in prod). It needs authentication that supports immediate
revocation (logout, account disable) and does not leak long-lived bearer tokens
into browser storage where XSS can steal them. An earlier iteration used JWT; it
was removed.

## Decision

Authentication uses **Redis-backed session cookies** — no JWT, no `localStorage`.
The session is created on `POST /api/auth/login` and destroyed on
`POST /api/auth/logout`; `req.session.userId` carries identity. `SessionGuard`
protects routes and `PermissionGuard` reads `req.session.userId` for RBAC. The
cookie is `httpOnly`, `sameSite: strict`, and `secure` in production. The frontend
sends `credentials: 'include'` on every fetch and never sets an `Authorization`
header.

## Consequences

- Sessions are revocable server-side instantly by dropping the Redis key — a
  property JWT cannot offer without a parallel blocklist.
- Secrets never reach JS-readable storage; `httpOnly` closes the XSS token-theft
  vector.
- Redis becomes a hard runtime dependency for auth (already present as the session
  store via `connect-redis`).
- **Do not reintroduce `JwtGuard`, JWT, or `localStorage` auth, and do not add
  `Authorization` headers on the frontend** — the cookie is the only mechanism.
  This is the rationale behind those `AGENTS.md` prohibitions.

## Considered alternatives

- **JWT access/refresh tokens** — rejected: revocation requires extra state, and
  storing tokens in the browser trades the XSS surface for it; no benefit for a
  same-origin single-tenant SPA.
