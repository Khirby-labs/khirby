# ADR-0058: OIDC SSO and account linking (preserve local userId)

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

Control Plane **is** the suite OIDC IdP (CP ADR-0008). Khirby is an RP: `OIDC_ISSUER` points at
CP `/v1/oidc`. Redis sessions and Enterprise multi-workspace scopes must keep local `users.id`.
Email-only linking is unsafe.

## Decision

1. Optional OIDC (`OIDC_ENABLED`): Authorization Code + PKCE against **Control Plane**; host-only
   session after complete (unchanged cookie model).
2. Columns `oidc_issuer` + `oidc_subject` (unique when set); `password_hash` nullable for
   SSO-only users.
3. **Login:** map `(iss, sub)` → user; provision new user if no local row; if email exists
   without link → `ACCOUNT_LINK_REQUIRED` (never auto-link by email).
4. **Link:** authenticated session (+ optional password re-auth) → IdP proof → bind `(iss, sub)`
   to **existing** `userId`.
5. After SSO login/link, resolve `session.scopeId` via Enterprise `SCOPE_PROVIDER` the same as
   password login (membership → workspace scope).
6. Revocation bound: session TTL / revalidation ≤ 15 minutes per CP ADR-0011.

## Consequences

- Standalone password login remains default when OIDC is off.
- Multi-workspace RLS enforcement stays in the plugin; IdP does not send scope headers.
