import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../core/errors/app-exception';
import { PluginRegistryService } from '../plugins/plugin-registry.service';
import { MarketplaceCatalogService } from './marketplace-catalog.service';
import { CatalogEntry } from './catalog';
// Relative, not '@khirby/types': `nest build` is plain tsc and the bare specifier
// would not survive into the build output (INCIDENTS 2026-07-24).
import type { MarketplaceCategory, MarketplacePlugin } from '../../../../../packages/types/src';

/** What a card falls back to when no catalog entry describes it. */
const UNLISTED_CATEGORY: MarketplaceCategory = 'other';
const UNLISTED_ICON = 'plugins';

/**
 * Turns the catalog document plus live installation state into the cards the SPA
 * renders.
 *
 * Status is resolved on EVERY request, never cached: the catalog document is what
 * has a fifteen-minute lifetime, and folding status into that cache would leave a
 * freshly installed plugin reading `available` for as long as the window lasts —
 * in production only, with every spec still green.
 */
@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    private readonly catalog: MarketplaceCatalogService,
    private readonly registry: PluginRegistryService,
  ) {}

  /**
   * The response set is `(catalog ∩ process) ∪ (installed rows in process)`.
   *
   * The union matters: a remote catalog that omits a native plugin would otherwise
   * make six installed cards vanish from the page, which reads as data loss. An
   * entry naming something absent from this image is dropped the other way, with a
   * log line, because its install button could never work.
   */
  async list(): Promise<MarketplacePlugin[]> {
    const [document, installedRows, available] = await Promise.all([
      this.catalog.load(),
      this.registry.findAll(),
      this.registry.listAvailable(),
    ]);

    const loaded = new Set(this.registry.loadedNames());
    const byName = new Map<string, CatalogEntry>();
    for (const entry of document.entries) {
      if (!loaded.has(entry.name)) {
        this.logger.warn(`Catalog lists ${entry.name}, absent from this image — hidden`);
        continue;
      }
      byName.set(entry.name, entry);
    }

    const cards: MarketplacePlugin[] = [];

    // Installed first: an orphan row (plugin no longer in the image) is skipped
    // here but stays visible in Settings → Plugins, where disabling it still works.
    for (const row of installedRows) {
      if (!loaded.has(row.name)) continue;
      cards.push(
        this.card(byName.get(row.name), {
          name: row.name,
          displayName: row.displayName,
          displayNameKey: row.displayNameKey,
          description: row.description,
          descriptionKey: row.descriptionKey,
          version: row.version,
          status: 'installed',
          enabled: row.enabled,
          configSchema: row.configSchema ?? [],
        }),
      );
    }

    // Then everything loaded-but-not-installed that the catalog actually offers.
    for (const plugin of available) {
      if (!byName.has(plugin.name)) continue;
      cards.push(
        this.card(byName.get(plugin.name), {
          name: plugin.name,
          displayName: plugin.displayName,
          displayNameKey: plugin.displayNameKey,
          description: plugin.description,
          descriptionKey: plugin.descriptionKey,
          version: plugin.version,
          status: 'available',
          enabled: false,
          configSchema: plugin.configSchema,
        }),
      );
    }

    return cards;
  }

  async findOne(name: string): Promise<MarketplacePlugin> {
    const card = (await this.list()).find((entry) => entry.name === name);
    if (!card) throw AppException.notFound('plugin', name);
    return card;
  }

  /**
   * Install by the plugin's `crm_*` name — never by the catalog's `package` field.
   *
   * Catalog membership is checked here, before the registry is asked: the
   * Marketplace must not install something it does not offer. "Not in the catalog"
   * and "not in this image" therefore both answer 404. That is a deliberate
   * simplification — the view cannot tell them apart from the response, and it does
   * not need to, because the operator's next action is the same either way
   * (ADR-0034).
   */
  async install(name: string) {
    const document = await this.catalog.load();
    const listed = document.entries.some((entry) => entry.name === name);
    if (!listed) throw AppException.notFound('plugin', name);

    return this.registry.install(name);
  }

  private card(
    entry: CatalogEntry | undefined,
    base: Omit<MarketplacePlugin, 'category' | 'vendor' | 'icon' | 'docsUrl'>,
  ): MarketplacePlugin {
    return {
      ...base,
      category: entry?.category ?? UNLISTED_CATEGORY,
      vendor: entry?.vendor ?? null,
      icon: entry?.icon ?? UNLISTED_ICON,
      docsUrl: entry?.docsUrl ?? null,
    };
  }
}
