import type { CrmPlugin } from '@khirby/plugin-sdk';
import { pluginRouteSlug } from './instance-plugin-scaffold';

/** Structural checks beyond “createPlugin loads”. Throws with a multi-line message. */
export function assertInstancePluginShape(plugin: CrmPlugin): void {
  const errors: string[] = [];

  if (!/^crm_[a-z0-9_]+$/.test(plugin.name)) {
    errors.push(`name must match crm_[a-z0-9_]+ (got ${JSON.stringify(plugin.name)})`);
  }
  if (!plugin.displayName?.trim()) {
    errors.push('displayName is required');
  }

  const routes = plugin.getFrontendRoutes?.() ?? [];
  const hasNestModule = typeof plugin.getNestModule === 'function';

  if (routes.length && !hasNestModule) {
    errors.push('getFrontendRoutes() requires getNestModule() — scaffold with nest: true');
  }
  if (hasNestModule && !routes.length) {
    errors.push('getNestModule() requires getFrontendRoutes() with at least one route');
  }

  const expectedSlug = pluginRouteSlug(plugin.name);
  for (const route of routes) {
    if (!route.path?.startsWith('/plugins/')) {
      errors.push(`route path must start with /plugins/ (got ${JSON.stringify(route.path)})`);
    }
    if (!route.name?.trim()) {
      errors.push('each route needs a Vue route name');
    }
    if (!route.navLabel?.trim() && !route.navLabelKey?.trim()) {
      errors.push(`route ${route.name ?? '?'} needs navLabel (sidebar label)`);
    }
    const slug = route.path?.replace(/^\/plugins\//, '');
    if (slug && slug !== expectedSlug) {
      errors.push(
        `route slug "${slug}" must match plugin name slug "${expectedSlug}" (@Controller('plugins/${expectedSlug}'))`,
      );
    }
  }

  if (errors.length) {
    throw new Error(`Plugin validation failed:\n- ${errors.join('\n- ')}`);
  }
}
