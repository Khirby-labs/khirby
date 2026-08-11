/**
 * Canonical RBAC permission catalog — re-exported from the shared types package
 * (`@khirby/types`) so the API and the web roles UI validate against one source.
 *
 * Both the bootstrap super-admin sync (core/auth/bootstrap.service.ts) and the
 * PermissionDto validation (dto/role.dto.ts) read from here, so the set of
 * assignable resources/actions can never drift between the two.
 */

// Relative import (like the plugins/ imports in app.module.ts): `nest build` is
// plain tsc, so a bare '@khirby/types' specifier would survive into dist and fail at
// runtime — the relative path compiles into dist with a working path instead.
export {
  PERMISSION_RESOURCES,
  PERMISSION_ACTIONS,
  ALL_PERMISSIONS,
  type PermissionResource,
  type PermissionAction,
} from '../../../../../packages/types/src';
