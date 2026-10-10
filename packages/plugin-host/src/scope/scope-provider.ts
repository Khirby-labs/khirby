/**
 * Optional Enterprise (or other) plugin registers this to resolve opaque scope
 * and declare whether row-scope enforcement is required (ADR-0055).
 */

export const SCOPE_PROVIDER = 'CRM_SCOPE_PROVIDER';

export type ScopeSessionLike = {
  userId?: string;
  /** Opaque id set only by a ScopeProvider after membership checks. */
  scopeId?: string;
};

export type ScopeRequestLike = {
  session?: ScopeSessionLike | null;
  headers?: Record<string, string | string[] | undefined>;
  url?: string;
  method?: string;
  /** Nest/Fastify route params (e.g. public form `:token`). */
  params?: Record<string, string | undefined>;
};

export interface ScopeProviderLike {
  /**
   * Resolve the active scope for an authenticated session request.
   * Must not trust client-supplied tenant headers; use session.scopeId + membership.
   */
  resolveFromSession(session: ScopeSessionLike): Promise<string | null>;

  /**
   * Optional: resolve scope for unauthenticated / ingress paths (forms, mail, MCP)
   * from server-trusted request data (e.g. form token already loaded elsewhere).
   */
  resolveFromRequest?(req: ScopeRequestLike): Promise<string | null>;

  /** True when row-scope enforcement must apply (e.g. ≥2 workspaces ever created). */
  isEnforcementRequired(): Promise<boolean> | boolean;

  /**
   * Optional claims for `/api/auth/me` (list of scopes, labels). Core forwards
   * blindly — it must not hardcode workspace product shapes.
   * Pass `preferredScopeId` from the session so the active claim matches switch.
   */
  getSessionClaims?(
    userId: string,
    preferredScopeId?: string | null,
  ): Promise<Record<string, unknown> | null>;
}
