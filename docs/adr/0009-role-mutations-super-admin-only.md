# 0009 — Role mutations require super-admin

- **Status:** Accepted
- **Date:** 2026-07-24
- **Deciders:** Damian Orzeł

## Context

RBAC endpoints were gated by a single `@RequirePermission('roles', 'manage')`.
That made `roles:manage` silently equivalent to full admin: any holder could
create a role, grant it every permission in the catalog, and assign it to
themselves — privilege escalation in three requests. Role *assignment* was also
reachable under two different gates (`roles:manage` via RolesController,
`settings:manage` via UsersController), so the authz model was ambiguous.
The system is single-tenant with a small, trusted operator group; delegated
role administration is not a product requirement.

## Decision

Only holders of a protected role (super-admin) may **mutate** roles or role
assignments: create/rename/delete a role, set its permissions, assign or
remove it from a user — enforced by `@RequireSuperAdmin()` on every mutating
endpoint in both RolesController and UsersController. **Reads** of the role
list remain available under `@RequirePermission('roles', 'manage')`.

## Consequences

- Easier: the escalation path is closed structurally — no permission arithmetic
  ("can only grant what you hold") to maintain; role assignment now has exactly
  one gate everywhere.
- Harder: role administration cannot be delegated to non-super-admins. If
  delegated administration is ever needed, write a new ADR — the likely design
  is grant-intersection (a grantor can only grant permissions they themselves
  hold), which we rejected for now as complexity without a driving use case.
- Don't gate role mutations with `@RequirePermission('roles', 'manage')` — that
  reopens the escalation. Do use `@RequireSuperAdmin()` for anything that
  changes roles, their permissions, or their assignment.
- `roles:manage` still exists as a permission but now only grants read access
  to the role list (needed e.g. by the Members view's role dropdown).

## Considered alternatives

- **Grant-intersection (grant only what you hold)** — closes self-escalation
  but not collusion, and adds per-permission arithmetic to every mutation;
  complexity unjustified in a single-tenant tool with no delegation need.
- **Keep `roles:manage` as-is, document the trust level** — leaves
  `roles:manage` a misleading name for "full admin"; rejected as a trap.
