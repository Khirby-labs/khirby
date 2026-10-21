/**
 * Optional token. The Enterprise multi-workspace plugin claims firm membership
 * after password or SSO login. Core must not know about workspace tables (ADR-0055).
 * Resolve at request time — the volume module binds after boot (ADR-0048).
 */

export const SESSION_MEMBERSHIP_SYNC = 'CRM_SESSION_MEMBERSHIP_SYNC';

export interface SessionMembershipSyncLike {
  syncForUser(userId: string, email: string | null | undefined): Promise<void>;
}
