/**
 * The Marketplace catalog: its format, and the copy baked into this image.
 *
 * A TypeScript module rather than a JSON file, deliberately. `apps/api` does not
 * enable `resolveJsonModule`, `nest-cli.json` declares no assets, and the runtime
 * image copies only the build output — so a `catalog.json` would typecheck, pass
 * every test, and then be missing in production. As a module it compiles into
 * `dist` with the rest of the code.
 *
 * The catalog carries METADATA only: category, vendor, glyph, docs link. Names and
 * descriptions come from the plugin instance, the same path Settings uses. Copying
 * them here would create two sources for one string and they would diverge at the
 * first edit (ADR-0034).
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
 * Major version of the document format. A document declaring anything else is
 * rejected in full and the in-image copy is used instead.
 */
export const CATALOG_FORMAT_VERSION = 1;

export interface CatalogEntry {
  /** npm package (or workspace) name — informational; installs go by `name`. */
  package: string;
  /** The plugin's own `crm_*` identifier. Every route parameter uses THIS. */
  name: string;
  version: string;
  category: MarketplaceCategory;
  vendor: string;
  icon: MarketplaceIcon;
  /** https only, and on the landing site — product docs do not live here (ADR-0029). */
  docsUrl: string;
}

export interface CatalogDocument {
  version: number;
  entries: CatalogEntry[];
}

/**
 * The copy that ships in this image — the fallback whenever
 * `MARKETPLACE_CATALOG_URL` is unset or the remote document cannot be trusted.
 *
 * Retired plugins must never reappear here (ADR-0026): `crm_taskboard` is gone
 * because boards became core, and an entry for it would offer an install that
 * could not work.
 */
export const LOCAL_CATALOG: CatalogDocument = {
  version: CATALOG_FORMAT_VERSION,
  entries: [
    {
      package: '@khirby/plugin-webhook',
      name: 'crm_webhook',
      version: '1.0.0',
      category: 'automation',
      vendor: 'Khirby',
      icon: 'plugins',
      docsUrl: 'https://khirby.com/docs/plugins/webhook',
    },
    {
      package: '@khirby/plugin-discord',
      name: 'crm_discord',
      version: '1.0.0',
      category: 'communication',
      vendor: 'Khirby',
      icon: 'plugins',
      docsUrl: 'https://khirby.com/docs/plugins/discord',
    },
    {
      package: '@khirby/plugin-listmonk',
      name: 'crm_listmonk',
      version: '1.1.0',
      category: 'marketing',
      vendor: 'Khirby',
      icon: 'mail',
      docsUrl: 'https://khirby.com/docs/plugins/listmonk',
    },
    {
      package: '@khirby/plugin-mcp',
      name: 'crm_mcp',
      version: '1.1.0',
      category: 'integration',
      vendor: 'Khirby',
      icon: 'plugins',
      docsUrl: 'https://khirby.com/docs/plugins/mcp',
    },
    {
      package: '@khirby/plugin-ai-compose',
      name: 'crm_ai_compose',
      version: '1.1.0',
      category: 'ai',
      vendor: 'Khirby',
      icon: 'mail',
      docsUrl: 'https://khirby.com/docs/plugins/ai-compose',
    },
    {
      package: '@khirby/plugin-pokelo',
      name: 'crm_pokelo',
      version: '1.0.0',
      category: 'ai',
      vendor: 'Khirby',
      icon: 'plugins',
      docsUrl: 'https://khirby.com/docs/plugins/pokelo',
    },
    /*
     * The example plugin, and in V1 the only entry that is NOT part of the native
     * set — so the only card a fresh instance shows with an Install button. It is
     * what makes the install path demonstrable at all: without it every card would
     * already be installed and the feature could not be exercised end to end.
     */
    {
      package: 'crm-plugin-hello',
      name: 'crm_hello',
      version: '1.0.0',
      category: 'automation',
      vendor: 'Khirby',
      icon: 'plugins',
      docsUrl: 'https://khirby.com/docs/plugins/create',
    },
  ],
};
