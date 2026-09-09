import { Injectable } from '@nestjs/common';
import { AppException } from '../../core/errors/app-exception';
import { ControlPlaneClient } from '../control-plane/control-plane.client';
import type {
  MarketplacePluginVersion,
  SubmitPlugin,
  SubmitPluginResponse,
} from '../control-plane/contracts';
import { InstallationIdentityService } from '../control-plane/installation-identity.service';
import { PluginRegistryService } from '../plugins/plugin-registry.service';
import { CatalogEntry, derivePluginNameFromPackage } from './catalog';
import { MarketplaceCatalogService } from './marketplace-catalog.service';
import { assertWebBundlePresent, PluginPackageInstaller } from './plugin-package.installer';
// Relative, not '@khirby/types': `nest build` is plain tsc and the bare specifier
// would not survive into the build output (INCIDENTS 2026-07-24).
import type { MarketplaceCategory, MarketplacePlugin } from '../../../../../packages/types/src';

/** What a card falls back to when no catalog entry describes it. */
const UNLISTED_CATEGORY: MarketplaceCategory = 'other';
const UNLISTED_ICON = 'plugins';

function loadSemver(): typeof import('semver') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('semver');
}

/** True when `latest` is a valid semver strictly greater than `installed`. */
export function isMarketplaceUpdateAvailable(
  installed: string | null | undefined,
  latest: string | null | undefined,
): boolean {
  if (!installed?.trim() || !latest?.trim()) return false;
  const semver = loadSemver();
  const a = semver.coerce(installed.trim());
  const b = semver.coerce(latest.trim());
  if (!a || !b) return false;
  return semver.gt(b, a);
}

/**
 * Turns the catalog document plus live installation state into the cards the SPA
 * renders. Status is resolved on EVERY request, never cached.
 */
@Injectable()
export class MarketplaceService {
  constructor(
    private readonly catalog: MarketplaceCatalogService,
    private readonly registry: PluginRegistryService,
    private readonly controlPlane: ControlPlaneClient,
    private readonly installer: PluginPackageInstaller,
    private readonly identity: InstallationIdentityService,
  ) {}

  /**
   * All Control Plane catalog entries, marked available/installed from DB rows.
   * No longer filters to `catalog ∩ process` — packages absent from the image are
   * still listed and installable via npm unpack.
   *
   * Union with installed rows missing from the catalog so local/instance plugins
   * do not vanish when the remote feed omits them.
   */
  async list(): Promise<MarketplacePlugin[]> {
    const [document, { installed: installedRows }] = await Promise.all([
      this.catalog.load(),
      this.registry.snapshot(),
    ]);

    const loaded = new Set(this.registry.loadedNames());
    const installedByName = new Map(installedRows.map((row) => [row.name, row]));
    const cards: MarketplacePlugin[] = [];
    const seen = new Set<string>();

    for (const entry of document.entries) {
      const row = installedByName.get(entry.name);
      if (row) {
        const latestVersion = entry.latestVersion ?? entry.version;
        cards.push(
          this.card(entry, {
            name: row.name,
            displayName: row.displayName,
            displayNameKey: row.displayNameKey,
            description: row.description,
            descriptionKey: row.descriptionKey,
            version: row.version,
            status: 'installed',
            enabled: row.enabled,
            configSchema: row.configSchema ?? [],
            updateAvailable: isMarketplaceUpdateAvailable(row.version, latestVersion),
          }),
        );
        seen.add(row.name);
        continue;
      }

      // Available: show even when not yet loaded into this process.
      cards.push(
        this.card(entry, {
          name: entry.name,
          displayName: entry.displayName,
          description: entry.description,
          version: entry.latestVersion ?? entry.version,
          status: 'available',
          enabled: false,
          configSchema: [],
          updateAvailable: false,
        }),
      );
      seen.add(entry.name);
    }

    for (const row of installedRows) {
      if (seen.has(row.name)) continue;
      // Orphan row with no code in process stays visible in Settings only.
      if (!loaded.has(row.name)) continue;
      cards.push(
        this.card(undefined, {
          name: row.name,
          displayName: row.displayName,
          displayNameKey: row.displayNameKey,
          description: row.description,
          descriptionKey: row.descriptionKey,
          version: row.version,
          status: 'installed',
          enabled: row.enabled,
          configSchema: row.configSchema ?? [],
          updateAvailable: false,
        }),
      );
    }

    return cards;
  }

  async findOne(nameOrSlug: string): Promise<MarketplacePlugin> {
    const cards = await this.list();
    const card = cards.find((entry) => entry.name === nameOrSlug || entry.slug === nameOrSlug);
    if (!card) throw AppException.notFound('plugin', nameOrSlug);
    return card;
  }

  /**
   * Install by Control Plane slug (preferred) or `crm_*` name.
   * Downloads from npm when the package is not already loaded in this process.
   */
  async install(slugOrName: string) {
    const key = slugOrName.trim();
    if (!key) throw AppException.notFound('plugin', slugOrName);

    const resolved = await this.resolveInstallTarget(key);
    if (!resolved) throw AppException.notFound('plugin', key);

    const { crmName, version } = resolved;

    if (this.registry.loadedNames().includes(crmName)) {
      return this.registry.install(crmName);
    }

    if (!version) {
      throw AppException.notFound('plugin', key);
    }

    const extracted = await this.installer.extract({
      packageName: version.packageName,
      version: version.version,
      checksum: version.checksum,
    });

    assertWebBundlePresent(extracted.absDir);

    const result = await this.registry.installFromDirectory(
      extracted.directory,
      extracted.packageName,
      { allowReservedScaffoldDirs: true },
    );

    const all = await this.registry.findAll();
    const installed = all.find((p) => p.name === result.name);
    if (installed) return installed;

    const row = await this.registry.findByName(result.name);
    if (!row) throw AppException.notFound('plugin', result.name);
    return row;
  }

  /**
   * Re-fetch the approved npm package and replace the volume copy for an
   * already-installed plugin. Updates the `plugins.version` row to match.
   */
  async update(slugOrName: string) {
    const key = slugOrName.trim();
    if (!key) throw AppException.notFound('plugin', slugOrName);

    const resolved = await this.resolveInstallTarget(key);
    if (!resolved?.version) throw AppException.notFound('plugin', key);

    const { crmName, version } = resolved;
    const existing = await this.registry.findByName(crmName);
    if (!existing) throw AppException.notFound('plugin', crmName);

    const extracted = await this.installer.extract({
      packageName: version.packageName,
      version: version.version,
      checksum: version.checksum,
    });

    assertWebBundlePresent(extracted.absDir);

    return this.registry.upgradeFromDirectory(extracted.directory, extracted.packageName, {
      allowReservedScaffoldDirs: true,
    });
  }

  async submit(body: Omit<SubmitPlugin, 'installationId'>): Promise<SubmitPluginResponse> {
    if (!this.controlPlane.isConfigured()) {
      throw AppException.badRequest('CONTROL_PLANE_URL is not configured', {
        code: 'CONTROL_PLANE_NOT_CONFIGURED',
      });
    }
    const identity = await this.identity.getOrCreate();
    const result = await this.controlPlane.submitPlugin({
      ...body,
      installationId: identity.installationId,
    });
    if (!result) throw AppException.upstreamFailed('controlPlane');
    return result;
  }

  private async resolveInstallTarget(slugOrName: string): Promise<{
    slug: string;
    crmName: string;
    version: MarketplacePluginVersion | null;
  } | null> {
    // Prefer slug lookup against Control Plane.
    let slug = slugOrName;
    let cpPlugin = this.controlPlane.isConfigured()
      ? await this.controlPlane.getPlugin(slugOrName)
      : null;

    if (!cpPlugin) {
      const document = await this.catalog.load();
      const entry = document.entries.find((e) => e.slug === slugOrName || e.name === slugOrName);
      if (entry) {
        slug = entry.slug;
        cpPlugin = this.controlPlane.isConfigured()
          ? await this.controlPlane.getPlugin(slug)
          : null;
        if (!cpPlugin && this.registry.loadedNames().includes(entry.name)) {
          return { slug, crmName: entry.name, version: null };
        }
      } else if (this.registry.loadedNames().includes(slugOrName)) {
        return { slug: slugOrName, crmName: slugOrName, version: null };
      }
    }

    if (!cpPlugin) return null;

    slug = cpPlugin.slug;
    const version = await this.resolveLatestVersion(slug, cpPlugin.latestVersion);
    const fromManifest =
      version?.manifest && typeof version.manifest.id === 'string' ? version.manifest.id : null;
    const crmName =
      fromManifest && /^crm_[a-z0-9_]+$/.test(fromManifest)
        ? fromManifest
        : derivePluginNameFromPackage(version?.packageName ?? cpPlugin.packageName);

    return { slug, crmName, version };
  }

  private async resolveLatestVersion(
    slug: string,
    latestVersion: string | null,
  ): Promise<MarketplacePluginVersion | null> {
    if (latestVersion) {
      const one = await this.controlPlane.getPluginVersion(slug, latestVersion);
      if (one?.approvedAt) return one;
    }
    const versions = await this.controlPlane.getPluginVersions(slug);
    if (!versions?.length) return null;
    const approved = versions.filter((v) => v.approvedAt);
    if (!approved.length) {
      throw AppException.notFound('plugin', slug);
    }
    return approved.slice().sort((a, b) => {
      const byDate = String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? ''));
      if (byDate) return byDate;
      return b.version.localeCompare(a.version, undefined, { numeric: true });
    })[0]!;
  }

  private card(
    entry: CatalogEntry | undefined,
    base: Omit<
      MarketplacePlugin,
      | 'category'
      | 'vendor'
      | 'icon'
      | 'docsUrl'
      | 'slug'
      | 'packageName'
      | 'publisherName'
      | 'verified'
      | 'compatible'
      | 'permissions'
      | 'latestVersion'
    > & { updateAvailable?: boolean },
  ): MarketplacePlugin {
    const latestVersion = entry?.latestVersion ?? null;
    const updateAvailable =
      base.updateAvailable ??
      (base.status === 'installed'
        ? isMarketplaceUpdateAvailable(base.version, latestVersion)
        : false);
    return {
      ...base,
      category: entry?.category ?? UNLISTED_CATEGORY,
      vendor: entry?.vendor ?? entry?.publisherName ?? null,
      icon: entry?.icon ?? UNLISTED_ICON,
      docsUrl: entry?.docsUrl ?? null,
      slug: entry?.slug,
      packageName: entry?.packageName ?? entry?.package,
      publisherName: entry?.publisherName ?? entry?.vendor ?? null,
      verified: entry?.verified,
      compatible: entry?.compatible,
      permissions: entry?.permissions ?? null,
      latestVersion,
      updateAvailable,
    };
  }
}
