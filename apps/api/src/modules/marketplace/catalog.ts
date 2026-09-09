/**
 * The Marketplace catalog: its format, and the empty in-image fallback.
 *
 * A TypeScript module rather than a JSON file, deliberately. `apps/api` does not
 * enable `resolveJsonModule`, `nest-cli.json` declares no assets, and the runtime
 * image copies only the build output — so a `catalog.json` would typecheck, pass
 * every test, and then be missing in production. As a module it compiles into
 * `dist` with the rest of the code.
 *
 * Live entries come from the Control Plane when `CONTROL_PLANE_URL` is set
 * (MarketplaceCatalogService). This module keeps the shared shape + empty fallback.
 */

/**
 * Closed set of categories. Closed because the view turns them into a filter and
 * each one needs a translated label; a free-form string would render as a raw
 * token in the UI.
 *
 * `other` is a real member, not a fallback hack: an installed plugin whose entry
 * is missing from the catalog still has to land in some category, or the filter
 * would be unable to reach it.
 */
export const MARKETPLACE_CATEGORIES = [
  'communication',
  'marketing',
  'automation',
  'ai',
  'integration',
  'other',
] as const;

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];

/**
 * Closed set of glyph keys — a key into the SPA's own icon map, never an image
 * URL. An instance with no internet must not render broken images, and a remote
 * document must not be able to point the UI at a new asset host.
 */
export const MARKETPLACE_ICONS = [
  'plugins',
  'mail',
  'contacts',
  'forms',
  'pipeline',
  'boards',
  'roles',
  'users',
  'settings',
] as const;

export type MarketplaceIcon = (typeof MARKETPLACE_ICONS)[number];

/**
 * Major version of the document format. Kept for the in-image empty document;
 * Control Plane entries are mapped into CatalogEntry without a remote format version.
 */
export const CATALOG_FORMAT_VERSION = 1;

export interface CatalogEntry {
  /** npm package name — informational; installs go by slug then resolve crm_* name. */
  package: string;
  /** The plugin's `crm_*` identifier (derived or from version manifest.id). */
  name: string;
  /** Control Plane marketplace slug — primary install/detail key for CP cards. */
  slug: string;
  version: string;
  category: MarketplaceCategory;
  vendor: string;
  icon: MarketplaceIcon;
  /** https only when present. */
  docsUrl: string | null;
  displayName: string;
  description: string | null;
  packageName: string;
  publisherName: string;
  verified: boolean;
  compatible: boolean;
  permissions: string[] | null;
  latestVersion: string | null;
}

export interface CatalogDocument {
  version: number;
  entries: CatalogEntry[];
}

/**
 * Empty marketplace image fallback when Control Plane is unset or unreachable.
 * Installed rows are still unioned by MarketplaceService.
 */
export const LOCAL_CATALOG: CatalogDocument = {
  version: CATALOG_FORMAT_VERSION,
  entries: [],
};

/**
 * Map an npm package name to the conventional `crm_*` plugin id.
 * `@khirby/plugin-webhook` → `crm_webhook`; `@khirby/crm-plugin-mcp` → `crm_mcp`.
 */
export function derivePluginNameFromPackage(packageName: string): string {
  const segment = (packageName.split('/').pop() ?? packageName).trim();
  if (!segment) return 'crm_unknown';
  if (/^crm_[a-z0-9_]+$/.test(segment)) return segment;

  let rest = segment;
  if (rest.startsWith('crm-plugin-')) rest = rest.slice('crm-plugin-'.length);
  else if (rest.startsWith('plugin-')) rest = rest.slice('plugin-'.length);

  const normalized = rest
    .replace(/-/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .toLowerCase();
  if (/^crm_/.test(normalized)) return normalized;
  return `crm_${normalized || 'unknown'}`;
}
