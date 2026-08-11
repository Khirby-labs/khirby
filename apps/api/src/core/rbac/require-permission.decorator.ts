/** Re-export — implementation lives in packages/plugin-host (ADR-0016). */
export {
  RequirePermission,
  RequireSuperAdmin,
  RequireAnyPermission,
  PERMISSION_KEY,
  PERMISSION_ANY_KEY,
  SUPER_ADMIN_KEY,
} from '../../../../../packages/plugin-host/src/require-permission.decorator';
