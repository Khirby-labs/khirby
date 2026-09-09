import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ControlPlaneClient } from '../control-plane/control-plane.client';
import type { MarketplacePlugin as CpMarketplacePlugin } from '../control-plane/contracts';
import {
  CATALOG_FORMAT_VERSION,
  CatalogDocument,
  CatalogEntry,
  LOCAL_CATALOG,
  derivePluginNameFromPackage,
} from './catalog';

/** Fifteen minutes: the catalog changes on release cadence, not per request. */
export const CATALOG_CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * One minute. Without a negative cache, a remote that is down would repay the
 * full fetch timeout on EVERY request — the endpoint would technically still
 * answer from the local copy while feeling broken.
 */
export const CATALOG_FAILURE_TTL_MS = 60 * 1000;

/**
 * Source of the catalog document: Control Plane when configured and reachable,
 * the empty in-image copy otherwise.
 *
 * This service answers exactly one question — "what does the catalog say?" — and
 * deliberately knows nothing about installation state. Statuses are resolved per
 * request by MarketplaceService.
 *
 * Nothing here runs at boot: the first fetch happens on the first request, so a
 * slow or unreachable Control Plane can never delay application start.
 */
@Injectable()
export class MarketplaceCatalogService {
  private readonly logger = new Logger(MarketplaceCatalogService.name);
  private cached: { document: CatalogDocument; expiresAt: number } | null = null;
  private failedUntil = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly controlPlane: ControlPlaneClient,
  ) {}

  async load(search?: string): Promise<CatalogDocument> {
    if (!this.controlPlane.isConfigured()) return LOCAL_CATALOG;

    const now = Date.now();
    // Search bypasses the success cache so operators see filtered results.
    if (!search && this.cached && now < this.cached.expiresAt) return this.cached.document;
    if (now < this.failedUntil) return LOCAL_CATALOG;

    const document = await this.fetchFromControlPlane(search);
    if (!document) {
      this.failedUntil = now + CATALOG_FAILURE_TTL_MS;
      return LOCAL_CATALOG;
    }

    if (!search) {
      this.cached = { document, expiresAt: now + CATALOG_CACHE_TTL_MS };
    }
    return document;
  }

  private async fetchFromControlPlane(search?: string): Promise<CatalogDocument | null> {
    const appVersion = (this.config.get<string>('APP_VERSION') ?? '').trim();
    // CP filters with semver compare — "dev" / non-semver makes every plugin look incompatible
    // and returns []. Only send compatibleWith when we have a real version.
    const compatibleWith = isSemverish(appVersion) ? appVersion : undefined;
    const plugins = await this.controlPlane.listPlugins({
      ...(compatibleWith ? { compatibleWith } : {}),
      ...(search ? { search } : {}),
    });

    if (plugins == null) {
      this.logger.warn('Control Plane marketplace list failed — using the empty catalog');
      return null;
    }

    const entries = plugins.map((p) => this.mapPlugin(p));
    entries.sort((a, b) => {
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      return a.displayName.localeCompare(b.displayName) || a.name.localeCompare(b.name);
    });

    return { version: CATALOG_FORMAT_VERSION, entries };
  }

  private mapPlugin(plugin: CpMarketplacePlugin): CatalogEntry {
    const docsUrl =
      typeof plugin.repositoryUrl === 'string' && plugin.repositoryUrl.startsWith('https://')
        ? plugin.repositoryUrl
        : null;

    return {
      slug: plugin.slug,
      package: plugin.packageName,
      packageName: plugin.packageName,
      name: derivePluginNameFromPackage(plugin.packageName),
      version: plugin.latestVersion ?? '0.0.0',
      latestVersion: plugin.latestVersion,
      category: 'other',
      vendor: plugin.publisherName,
      publisherName: plugin.publisherName,
      icon: 'plugins',
      docsUrl,
      displayName: plugin.name,
      description: plugin.description,
      verified: plugin.verified,
      compatible: plugin.compatible ?? true,
      permissions: plugin.permissions,
    };
  }
}

/** True for `1.2.3`, `v1.2.3`, optional prerelease — false for `dev` / empty. */
export function isSemverish(version: string): boolean {
  return /^v?\d+\.\d+\.\d+/i.test(version.trim());
}
