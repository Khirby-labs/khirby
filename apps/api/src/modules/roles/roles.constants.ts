// Relative import (like permission-catalog): `nest build` is plain tsc, so a bare
// '@khirby/types' specifier would survive into dist and fail at runtime.
import { SUPER_ADMIN_ROLE_NAME } from '../../../../../packages/types/src';

/**
 * Derived from the shared constant so the role's name has exactly one spelling
 * across the seeder, the guards and the SPA's seed-text lookup (ADR-0011).
 */
export const PROTECTED_ROLE_NAMES = [SUPER_ADMIN_ROLE_NAME] as const;

export function isProtectedRoleName(name: string): boolean {
  return (PROTECTED_ROLE_NAMES as readonly string[]).includes(name);
}
