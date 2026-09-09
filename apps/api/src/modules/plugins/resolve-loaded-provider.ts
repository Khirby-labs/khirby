import type { InjectionToken } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import { NestContainer } from '@nestjs/core/injector/container';

/**
 * Resolve a provider that may live on a lazily loaded volume-plugin module.
 *
 * Image plugins are imported in `PluginsModule.forRoot` and constructor
 * `@Optional() @Inject(token)` works. Volume plugins (empty marketplace image)
 * are bound later via `LazyModuleLoader` (ADR-0036) — constructor inject in
 * core then stays `null` for the process lifetime. Walk the container so Ask
 * Khirby / tool adapters see `AI_COMPOSE_LLM` / `KNOWLEDGE_CONTEXT` after boot.
 */
export function resolveLoadedProvider<T>(
  moduleRef: Pick<ModuleRef, 'get'>,
  token: InjectionToken,
): T | null {
  try {
    const value = moduleRef.get<T>(token, { strict: false });
    if (value) return value;
  } catch {
    // Token is not in this module's tree (lazy volume module).
  }

  const container = (moduleRef as unknown as { container?: NestContainer }).container;
  if (!container?.getModules) return null;

  for (const mod of container.getModules().values()) {
    if (!mod.hasProvider(token)) continue;
    const instance = mod.getProviderByKey(token)?.instance as T | undefined;
    if (instance) return instance;
  }
  return null;
}
