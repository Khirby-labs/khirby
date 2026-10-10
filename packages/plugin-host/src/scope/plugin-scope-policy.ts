import type { ScopeSessionLike } from './scope-provider';

/**
 * Optional Enterprise policy: install stays instance-global; enable + config are
 * per workspace; only workspace owners manage plugins/marketplace (ADR-0057).
 */
export const PLUGIN_SCOPE_POLICY = 'CRM_PLUGIN_SCOPE_POLICY';

export type PluginScopeState = {
  enabled: boolean;
  config: Record<string, string>;
};

export interface PluginScopePolicyLike {
  /** True when per-workspace plugin enablement applies (Multi-Workspace loaded). */
  isActive(): Promise<boolean> | boolean;

  /** Throws Forbidden when the session user is not owner of the active workspace. */
  assertAdmin(session: ScopeSessionLike): Promise<void>;

  isEnabled(pluginName: string, scopeId: string | null): Promise<boolean>;

  /**
   * Workspace config overlay. `null` → caller keeps the instance `plugins.config`.
   * Empty object is a valid overlay (cleared secrets).
   */
  getConfig(pluginName: string, scopeId: string | null): Promise<Record<string, string> | null>;

  setState(
    pluginName: string,
    scopeId: string,
    patch: { enabled?: boolean; config?: Record<string, string> },
  ): Promise<PluginScopeState>;
}
