import type { InjectionToken } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import { NestContainer } from '@nestjs/core/injector/container';

/**
 * Resolve a provider that may live on a lazily loaded volume-plugin module (ADR-0048).
 *
 * Image plugins imported at boot work with constructor `@Optional()`. Volume plugins
 * bind later via `LazyModuleLoader` — constructor inject then stays `null`. Walk
 * ModuleRef + the Nest container so callers see the token after install/hot-load.
 *
 * After a Marketplace update, LazyModuleLoader appends a second module (ADR-0036).
 * Prefer the last instance in container insertion order so Ask/Compose pick up
 * the reloaded token rather than the pre-update one.
 */
export function resolveLoadedProvider<T>(
  moduleRef: Pick<ModuleRef, 'get'>,
  token: InjectionToken,
): T | null {
  const container = (moduleRef as unknown as { container?: NestContainer }).container;
  if (container?.getModules) {
    let latest: T | null = null;
    for (const mod of container.getModules().values()) {
      if (!mod.hasProvider(token)) continue;
      const instance = mod.getProviderByKey(token)?.instance as T | undefined;
      if (instance) latest = instance;
    }
    if (latest) return latest;
  }

  try {
    const value = moduleRef.get<T>(token, { strict: false });
    if (value) return value;
  } catch {
    // Token is not in this module's tree (lazy volume module).
  }

  return null;
}
