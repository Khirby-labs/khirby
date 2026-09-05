import { eq, inArray } from 'drizzle-orm';
import type { Connection } from '../database/transaction';
import { roles, userRoles } from '../database/schema';
import { PROTECTED_ROLE_NAMES } from '../../modules/roles/roles.constants';
import { AppException } from '../errors/app-exception';

/** Call under the identity mutation lock, using the same transaction as the write. */
export async function assertCanManageUser(
  db: Connection,
  targetId: string,
  actorId: string | undefined,
  deleting = false,
) {
  const holders = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(inArray(roles.name, [...PROTECTED_ROLE_NAMES]));
  if (!holders.some((holder) => holder.userId === targetId)) return;
  if (!actorId || !holders.some((holder) => holder.userId === actorId)) {
    throw AppException.superAdminRequired();
  }
  if (deleting && new Set(holders.map((holder) => holder.userId)).size <= 1) {
    throw AppException.lastSuperAdmin();
  }
}
