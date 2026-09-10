import { Injectable, Inject, OnModuleInit, Logger, Optional, HttpException } from '@nestjs/common';
import { createReadStream, existsSync, rmSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import 'reflect-metadata';
import { LazyModuleLoader, ModuleRef } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import { plugins } from '../../core/database/schema';
import { CrmPlugin, CrmEvent, PluginContext, CRM_PLUGINS } from '@khirby/plugin-sdk';
import { AppException } from '../../core/errors/app-exception';
import type { InstancePluginsLike } from '../../../../../packages/plugin-host/src';
// Relative, not '@khirby/types': `nest build` is plain tsc and the bare
// specifier does not survive into the build output (INCIDENTS 2026-07-24).
import type { AvailablePlugin } from '../../../../../packages/types/src';
import {
  appendInstanceManifest,
  assertPathInside,
  defaultInstancePluginsDir,
  ensureInstanceDir,
  findInstanceLocalDirForPlugin,
  findMarketplaceLocalDirForPlugin,
  FIRST_PARTY_PLUGIN_DIRS,
  preferLocalCheckoutPlugins,
  hasWebEntryBundle,
  isSafeLocalSegment,
  isSafeRelPath,
  listInstancePluginFiles,
  loadPluginFromDir,
  normalizeInstancePluginRef,
  pluginVolumeRoot,
  readInstancePluginFile,
  readPackageName,
  removeInstanceManifest,
  resolveInPlugin,
  resolveInstancePluginDirectory,
  scaffoldInstancePlugin,
  WEB_ENTRY_REL,
  writeInstancePluginFile,
} from './instance-plugins.loader';
import { INSTANCE_PLUGIN_CONTRACT } from './instance-plugin-contract';
import { loadImagePlugins } from './load-plugins';
import { PluginNestHttpRegistrar } from './plugin-nest-http.registrar';
import { InstancePluginHttpBridge } from './instance-plugin-http.bridge';

type PluginRow = typeof plugins.$inferSelect;

/**
 * Former first-party plugin names — reserved for instance *scaffold* collision
 * only. The empty marketplace image does not auto-install any of these
 * (ADR-0032 seed path removed); Marketplace may install packages that reuse
 * these `crm_*` names.
 */
export const NATIVE_PLUGIN_NAMES = [
  'crm_webhook',
  'crm_discord',
  'crm_listmonk',
  'crm_mcp',
  'crm_ai_compose',
  'crm_pokelo',
] as const;

/** Scaffold-reserved names: former natives plus the in-repo example. */
export const RESERVED_INSTANCE_PLUGIN_NAMES: readonly string[] = [
  ...NATIVE_PLUGIN_NAMES,
  'crm_hello',
];

/** Empty image: nothing is image-native; former names are scaffold-reserved only. */
export function isNativePlugin(_name: string): boolean {
  return false;
}

/**
 * Marketplace golden-path fixture (ADR-0035) — installable from Marketplace,
 * not listed under Settings → Plugins. The row still exists while the demo
 * path is exercised; operators manage it from Marketplace only.
 */
export const MARKETPLACE_DEMO_PLUGIN_NAMES = ['crm_hello'] as const;

export function isMarketplaceDemoPlugin(name: string): boolean {
  return (MARKETPLACE_DEMO_PLUGIN_NAMES as readonly string[]).includes(name);
}

@Injectable()
export class PluginRegistryService implements OnModuleInit, InstancePluginsLike {
  private readonly logger = new Logger(PluginRegistryService.name);
  private readonly contexts = new Map<string, PluginContext>();

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    @Inject(CRM_PLUGINS) private readonly registeredPlugins: CrmPlugin[],
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly lazyModuleLoader?: LazyModuleLoader,
  ) {}

  private get pluginHttpRegistrar(): PluginNestHttpRegistrar | undefined {
    try {
      return this.moduleRef.get(PluginNestHttpRegistrar, { strict: false });
    } catch {
      return undefined;
    }
  }

  private get instanceBridge(): InstancePluginHttpBridge | undefined {
    try {
      return this.moduleRef.get(InstancePluginHttpBridge, { strict: false });
    } catch {
      return undefined;
    }
  }

  /** Drop HTTP handlers and free the Nest module token so a same-process reinstall can rebind. */
  private unbindPluginHttp(name: string): void {
    const registrar = this.pluginHttpRegistrar;
    if (registrar && typeof registrar.unregisterPlugin === 'function') {
      registrar.unregisterPlugin(name);
      return;
    }
    this.instanceBridge?.unregisterPlugin(name);
  }

  /**
   * Boot no longer installs anything: a row in `plugins` IS the installation
   * (ADR-0032), so a plugin present in the image without a row stays "available"
   * until the operator installs it from the Marketplace.
   *
   * An empty table is a no-op (control-plane / empty marketplace image — no
   * native seed). Rows that exist keep the current sync path; volume Nest/HTTP
   * is bound only for installed rows so a leftover unpack on disk does not look
   * "loaded" while Marketplace still shows available.
   */
  async onModuleInit() {
    if (preferLocalCheckoutPlugins()) {
      this.logger.log('KHIRBY_PLUGINS_LOCAL=on — volume plugins resolve to crm-plugin-* checkouts');
    }
    const rows = await this.db.select().from(plugins);
    const installedNames = new Set(rows.map((row) => row.name));

    const byName = new Map(rows.map((row) => [row.name, row]));
    for (const plugin of this.registeredPlugins) {
      const row = byName.get(plugin.name);
      // No row → available, not installed. Image Nest modules are still mounted
      // (PluginsModule.forRoot); volume GET is on the HTTP bridge. isEnabled()
      // stays false, so PluginEnabledGuard answers 503.
      if (!row) continue;
      await this.syncInstalledPlugin(plugin, row);
    }

    await this.bindVolumePluginHttp(installedNames);
  }

  /**
   * GET /api/plugins/:segment is owned by InstancePluginHttpBridgeController.
   * Volume Nest modules are not imported in forRoot (those become irreplaceable
   * Fastify routes), so they must be lazy-loaded and bound on the bridge at boot
   * — but only when a `plugins` row says they are installed (ADR-0032).
   */
  private async bindVolumePluginHttp(installedNames: Set<string>): Promise<void> {
    const imageNames = new Set(loadImagePlugins().map((plugin) => plugin.name));
    for (const plugin of this.registeredPlugins) {
      if (imageNames.has(plugin.name)) continue;
      if (!installedNames.has(plugin.name)) continue;
      await this.ensureVolumeNestBound(plugin);
    }
  }

  /**
   * Lazy-load a volume plugin's Nest module onto the HTTP bridge.
   * Safe to call when the module is already loaded (append-only / LazyModuleLoader).
   */
  private async ensureVolumeNestBound(plugin: CrmPlugin): Promise<void> {
    const nestModule = plugin.getNestModule?.();
    if (!nestModule) return;
    if (this.lazyModuleLoader) {
      await this.lazyModuleLoader.load(() => Promise.resolve(nestModule));
    } else {
      this.logger.warn(
        `Instance plugin ${plugin.name}: LazyModuleLoader unavailable — HTTP not wired`,
      );
      return;
    }
    const paths = await this.pluginHttpRegistrar?.registerModuleRoutes(nestModule, {
      pluginName: plugin.name,
    });
    if (paths?.length) {
      const local = this.instanceDirectory(plugin.name);
      this.logger.log(
        `Instance plugin ${plugin.name} HTTP routes (${local ?? 'unknown'}): ${paths.join(', ')}`,
      );
    } else {
      this.logger.warn(
        `Instance plugin ${plugin.name}: Nest module loaded but no HTTP routes were registered`,
      );
    }
  }

  /**
   * Insert the row for `plugin`, tolerating a concurrent writer.
   *
   * Two app containers may race on install (`docker-stack.yml` uses
   * `order: start-first`). `name` is unique, so the loser's insert is a no-op
   * that returns no row — and it must then read the winner's row and carry on.
   * Bailing out there would leave this process with rows in the database and no
   * in-memory context, and emit() skips context-less plugins: every event in
   * that replica would be dropped silently, which is worse than the crash this
   * guards against.
   */
  private async insertRow(plugin: CrmPlugin): Promise<PluginRow | null> {
    const [inserted] = await this.db
      .insert(plugins)
      .values({
        name: plugin.name,
        displayName: plugin.displayName,
        description: plugin.description ?? null,
        version: plugin.version,
        enabled: true,
        config: {},
      } as any)
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      this.logger.log(`Plugin installed: ${plugin.name} v${plugin.version}`);
      return inserted;
    }

    const existing = await this.findByName(plugin.name);
    if (!existing) {
      this.logger.error(`Plugin ${plugin.name}: insert was a no-op and no row exists`);
      return null;
    }
    this.logger.log(`Plugin ${plugin.name} was installed concurrently — adopting existing row`);
    return existing;
  }

  /** Reconcile an already-installed plugin with the version in this image. */
  private async syncInstalledPlugin(plugin: CrmPlugin, row: PluginRow): Promise<void> {
    let current = row;

    if (row.version !== plugin.version) {
      await this.db
        .update(plugins)
        .set({ version: plugin.version, updatedAt: new Date() } as any)
        .where(eq(plugins.name, plugin.name));
      this.logger.log(`Plugin updated: ${plugin.name} ${row.version} → ${plugin.version}`);
      current = { ...row, version: plugin.version };
    }

    await this.activate(plugin, current);
  }

  /**
   * Bring one installed plugin up: migrations, then context, then onInit.
   * Shared by boot, install() and enable() so the sequence exists once.
   *
   * `onMigrate` runs even when the row is DISABLED — the plugin's tables must
   * exist before an operator later switches it on. Only the context and onInit
   * are gated on `enabled`, which is what keeps emit() skipping a disabled
   * plugin.
   *
   * Returns false when the schema failed to apply. Boot only logs that;
   * install() and enable() turn it into a rolled-back failure, because there a
   * human is waiting for an answer.
   */
  private async activate(plugin: CrmPlugin, row: PluginRow): Promise<boolean> {
    if (plugin.onMigrate) {
      try {
        await plugin.onMigrate((this.db as any).$client);
        this.logger.log(`Plugin ${plugin.name}: migrations applied`);
      } catch (err) {
        this.logger.error(`Plugin ${plugin.name} onMigrate failed: ${(err as Error).message}`);
        return false;
      }
    }

    if (!row.enabled) return true;

    const ctx = this.buildContext(plugin.name, row.config ?? {});
    this.contexts.set(plugin.name, ctx);

    if (plugin.onInit) {
      try {
        await plugin.onInit(ctx);
      } catch (err) {
        // A broken onInit must not abort boot or block the other plugins.
        this.logger.error(`Plugin ${plugin.name} onInit failed: ${(err as Error).message}`);
      }
    }

    return true;
  }

  /** Emituje event do wszystkich włączonych pluginów które mają onEvent */
  async emit(event: CrmEvent): Promise<void> {
    for (const plugin of this.registeredPlugins) {
      if (!plugin.onEvent) continue;
      const ctx = this.contexts.get(plugin.name);
      if (!ctx) continue; // plugin wyłączony lub nie init
      try {
        await plugin.onEvent(event, ctx);
      } catch (err) {
        this.logger.error(
          `Plugin ${plugin.name} onEvent(${event.type}) failed: ${(err as Error).message}`,
        );
      }
    }
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  private enrichRow(row: typeof plugins.$inferSelect) {
    const plugin = this.registeredPlugins.find((p) => p.name === row.name);
    const frontendRoutes = row.enabled
      ? (plugin
          ?.getFrontendRoutes?.()
          ?.map(({ path, name, navLabel, navLabelKey, navIcon, showInNav }) => ({
            path,
            name,
            navLabel: navLabel?.trim() || row.displayName || plugin.displayName || row.name,
            navLabelKey,
            navIcon,
            showInNav,
          })) ?? [])
      : [];
    const configSchema = plugin?.getConfigSchema?.() ?? [];
    /*
     * The row keeps the seeded English literals — it is never rewritten in a UI
     * language (ADR-0011). The message keys come from the live plugin instead, so
     * the SPA can localize the card while the stored identity stays stable, and a
     * plugin that declares no key simply renders its literal.
     */
    const web = this.webBundleFields(row.name);
    return {
      ...row,
      displayNameKey: plugin?.displayNameKey,
      descriptionKey: plugin?.descriptionKey,
      frontendRoutes,
      configSchema,
      codeLoaded: !!plugin,
      canUninstall: !isNativePlugin(row.name),
      ...web,
    };
  }

  /** Optional SPA hot-load fields when volume package ships dist/web/entry.js. */
  private webBundleFields(
    name: string,
  ): { webBundleUrl: string; webBundleVersion: string } | Record<string, never> {
    const local = findInstanceLocalDirForPlugin(this.instanceDir(), name);
    if (!local) return {};
    const absDir = join(this.instanceDir(), local);
    if (!hasWebEntryBundle(absDir)) return {};
    const entry = join(absDir, WEB_ENTRY_REL);
    return {
      webBundleUrl: `/api/plugins/${encodeURIComponent(name)}/web/entry.js`,
      webBundleVersion: String(statSync(entry).mtimeMs),
    };
  }

  /**
   * Resolve a file under an installed volume plugin's `dist/web/` (path-traversal safe).
   * Plugin must be installed; enabled is not required so a mid-load disable does not 404.
   */
  async resolveWebBundleFile(name: string, relUnderWeb: string): Promise<string> {
    const row = await this.findByName(name);
    if (!row) throw AppException.notFound('plugin', name);
    const local = findInstanceLocalDirForPlugin(this.instanceDir(), name);
    if (!local) throw AppException.notFound('web-bundle', name);
    const webRoot = join(this.instanceDir(), local, 'dist', 'web');
    if (!existsSync(join(webRoot, 'entry.js'))) {
      throw AppException.notFound('web-bundle', name);
    }
    const rel = relUnderWeb.replace(/^\/+/, '');
    if (!rel || !isSafeRelPath(rel)) {
      throw AppException.badRequest('path must be relative without ..', { reason: 'bad_path' });
    }
    const abs = resolveInPlugin(webRoot, rel);
    assertPathInside(webRoot, abs);
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      throw AppException.notFound('file', rel);
    }
    // Extra guard: never escape dist/web even if resolveInPlugin changes.
    const normalizedRel = relative(webRoot, abs).split(sep).join('/');
    if (normalizedRel.startsWith('..') || normalizedRel.includes('\0')) {
      throw AppException.badRequest('path must be relative without ..', { reason: 'bad_path' });
    }
    return abs;
  }

  openWebBundleStream(absPath: string) {
    return createReadStream(absPath);
  }

  async findAll() {
    const rows = await this.db.select().from(plugins);
    return rows
      .filter((row) => !isMarketplaceDemoPlugin(row.name))
      .map((row) => this.enrichRow(row));
  }

  async findByName(name: string) {
    const [row] = await this.db.select().from(plugins).where(eq(plugins.name, name)).limit(1);
    return row ?? null;
  }

  /**
   * Plugins present in this process with no row — what the Marketplace can offer.
   *
   * Shaped like enrichRow's localizable half so a card looks the same before and
   * after installing: the English literal plus the optional message key, with
   * copy owned by the SPA (ADR-0011).
   */
  async listAvailable(): Promise<AvailablePlugin[]> {
    const rows = await this.db.select().from(plugins);
    return this.availableFrom(rows);
  }

  /**
   * Installed rows and available plugins derived from ONE read of the table.
   *
   * Asking for the two lists separately means two SELECTs, and an `install()`
   * committing between them makes the answers disagree: the plugin is installed
   * according to one query and available according to the other, so the same name
   * appears twice in the Marketplace (two cards, one offering Install) — or, with
   * the opposite ordering, in neither and it vanishes until the next refetch.
   * Postgres gives no ordering guarantee between statements issued on different
   * pooled connections, so this is not a narrow theoretical window.
   *
   * A single snapshot cannot contradict itself, and costs one query instead of two.
   */
  async snapshot(): Promise<{
    installed: ReturnType<PluginRegistryService['enrichRow']>[];
    available: AvailablePlugin[];
  }> {
    const rows = await this.db.select().from(plugins);
    return {
      installed: rows.map((row) => this.enrichRow(row)),
      available: this.availableFrom(rows),
    };
  }

  /** Registry minus the names already present in `rows`. */
  private availableFrom(rows: PluginRow[]): AvailablePlugin[] {
    const installed = new Set(rows.map((row) => row.name));
    return this.registeredPlugins
      .filter((plugin) => !installed.has(plugin.name))
      .map((plugin) => this.describeAvailable(plugin));
  }

  private describeAvailable(plugin: CrmPlugin): AvailablePlugin {
    return {
      name: plugin.name,
      displayName: plugin.displayName,
      displayNameKey: plugin.displayNameKey,
      description: plugin.description ?? null,
      descriptionKey: plugin.descriptionKey,
      version: plugin.version,
      configSchema: plugin.getConfigSchema?.() ?? [],
    };
  }

  /** True when the plugin has an active in-memory context (enabled + migrated + inited). */
  isEnabled(name: string): boolean {
    return this.contexts.has(name);
  }

  /**
   * Names this process actually loaded — the availability filter.
   *
   * A `plugins` row can outlive its code (a plugin dropped from the image), and a
   * catalog entry can name something this build does not ship. Both must be kept
   * off the Marketplace, where they would offer an install that cannot work.
   */
  loadedNames(): string[] {
    return this.registeredPlugins.map((plugin) => plugin.name);
  }

  instanceDirectory(name: string): string | null {
    return findInstanceLocalDirForPlugin(this.instanceDir(), name);
  }

  frontendPages(name: string): Array<{ path: string; navLabel: string }> {
    const plugin = this.registeredPlugins.find((p) => p.name === name);
    const routes = plugin?.getFrontendRoutes?.() ?? [];
    const visible = routes.filter((route) => route.showInNav !== false);
    const chosen = visible.length ? visible : routes;
    // Same prefix as assertInstancePluginShape — never surface a non-/plugins/ path to agents.
    return chosen
      .filter((route) => typeof route.path === 'string' && route.path.startsWith('/plugins/'))
      .map((route) => ({
        path: route.path,
        navLabel: typeof route.navLabel === 'string' ? route.navLabel.trim() : '',
      }));
  }

  /**
   * Install a plugin that is present in this process but has no row.
   *
   * Image Nest modules are already mounted via PluginsModule.forRoot. Volume
   * Nest is bound only for installed rows at boot — so Marketplace install of a
   * package already scanned from disk must wire LazyModuleLoader here before
   * the row + context go live (ADR-0016 still bans unload).
   */
  async install(name: string) {
    const plugin = this.registeredPlugins.find((p) => p.name === name);
    // Not in this image — nothing to install, and nothing written.
    if (!plugin) throw AppException.notFound('plugin', name);

    const existing = await this.findByName(name);
    if (existing) throw AppException.alreadyExists('plugin', 'name', name);

    const imageNames = new Set(loadImagePlugins().map((p) => p.name));
    if (!imageNames.has(plugin.name)) {
      await this.ensureVolumeNestBound(plugin);
    }

    const [inserted] = await this.insertForInstall(plugin);

    // A plugin whose schema will not apply must not be left installed: the
    // operator would see it as active and every call into it would fail.
    const ok = await this.activate(plugin, inserted);
    if (!ok) {
      await this.db.delete(plugins).where(eq(plugins.name, name));
      this.contexts.delete(name);
      throw AppException.badRequest(`Plugin ${name} migration failed`);
    }

    this.logger.log(`Plugin installed from marketplace: ${name} v${plugin.version}`);
    return this.enrichRow(inserted);
  }

  instanceDir(): string {
    return defaultInstancePluginsDir();
  }

  packageDir(directory: string): string {
    try {
      return pluginVolumeRoot(this.instanceDir(), this.resolveDirOrSegment(directory));
    } catch (err) {
      this.throwAuthoring(err);
    }
  }

  reservedNames(): readonly string[] {
    return RESERVED_INSTANCE_PLUGIN_NAMES;
  }

  validate(absPackageDir: string): { name: string } {
    try {
      // Reserved names apply to scaffold only — Marketplace may install packages
      // that reuse former native `crm_*` identifiers on an empty image.
      const plugin = loadPluginFromDir(absPackageDir);
      return { name: plugin.name };
    } catch (err) {
      const message =
        err instanceof Error ? err.message || err.name || 'Plugin validation failed' : String(err);
      const errName = (err as Error).name;
      if (errName === 'web_bundle_required' || message === 'web_bundle_required') {
        throw AppException.badRequest(
          'exports["./web"] requires dist/web/entry.js on the volume package',
          { reason: 'web_bundle_required' },
        );
      }
      if (errName === 'web_not_hot_loadable' || message === 'web_not_hot_loadable') {
        // Legacy alias — same gate as web_bundle_required (ADR-0043).
        throw AppException.badRequest(
          'exports["./web"] requires dist/web/entry.js on the volume package',
          { reason: 'web_bundle_required' },
        );
      }
      if (err instanceof HttpException) throw err;
      throw AppException.badRequest(message);
    }
  }

  appendManifest(packageName: string, localDir: string): void {
    try {
      ensureInstanceDir(this.instanceDir());
      appendInstanceManifest(this.instanceDir(), packageName, localDir);
    } catch (err) {
      this.logger.error(`Cannot write instance manifest: ${(err as Error).message}`);
      throw AppException.upstreamFailed('instance-plugins');
    }
  }

  /**
   * validate → manifest → hotLoad (first time) or enable/install row (retry).
   * Safe to call when the plugin is already loaded in this process.
   *
   * Marketplace npm unpack may pass `allowReservedScaffoldDirs` so packages can
   * land on former first-party directory names on an empty image.
   */
  async installFromDirectory(
    localDir: string,
    packageName?: string,
    opts?: { allowReservedScaffoldDirs?: boolean },
  ): Promise<{ name: string; status: 'installed' | 're-enabled' | 'already_active' }> {
    const resolved = opts?.allowReservedScaffoldDirs
      ? this.resolveDirAllowingReserved(localDir)
      : this.resolveExistingDir(localDir);
    const absDir = pluginVolumeRoot(this.instanceDir(), resolved, {
      allowReservedScaffoldDirs: opts?.allowReservedScaffoldDirs,
    });
    const { name } = this.validate(absDir);
    const pkgName = packageName?.trim() || readPackageName(absDir);
    this.appendManifest(pkgName, resolved);

    if (!this.loadedNames().includes(name)) {
      await this.hotLoad(absDir);
      return { name, status: 'installed' };
    }

    const row = await this.findByName(name);
    if (!row) {
      await this.install(name);
      return { name, status: 'installed' };
    }
    if (!row.enabled) {
      await this.enable(name);
      return { name, status: 're-enabled' };
    }
    await this.reloadFromDirectory(resolved);
    return { name, status: 'already_active' };
  }

  /**
   * Marketplace upgrade: replace volume files (caller already unpacked), reload
   * in-process code, and bump the `plugins.version` row to the package version.
   */
  async upgradeFromDirectory(
    localDir: string,
    packageName?: string,
    opts?: { allowReservedScaffoldDirs?: boolean },
  ): Promise<ReturnType<PluginRegistryService['enrichRow']>> {
    const resolved = opts?.allowReservedScaffoldDirs
      ? this.resolveDirAllowingReserved(localDir)
      : this.resolveExistingDir(localDir);
    const absDir = pluginVolumeRoot(this.instanceDir(), resolved, {
      allowReservedScaffoldDirs: opts?.allowReservedScaffoldDirs,
    });
    const { name } = this.validate(absDir);
    const row = await this.findByName(name);
    if (!row) throw AppException.notFound('plugin', name);

    const pkgName = packageName?.trim() || readPackageName(absDir);
    this.appendManifest(pkgName, resolved);

    if (!this.loadedNames().includes(name)) {
      await this.hotLoad(absDir);
    } else {
      await this.reloadFromDirectory(resolved);
    }

    const plugin = this.registeredPlugins.find((p) => p.name === name);
    if (!plugin) throw AppException.notFound('plugin', name);

    const ok = await this.activate(plugin, { ...row, version: plugin.version });
    if (!ok) {
      this.contexts.delete(name);
      throw AppException.badRequest(`Plugin ${name} migration failed`);
    }

    const [updated] = await this.db
      .update(plugins)
      .set({
        version: plugin.version,
        displayName: plugin.displayName,
        description: plugin.description ?? null,
        updatedAt: new Date(),
      } as any)
      .where(eq(plugins.name, name))
      .returning();

    const current = updated ?? { ...row, version: plugin.version };
    this.logger.log(`Plugin upgraded from marketplace: ${name} → v${plugin.version}`);
    return this.enrichRow(current);
  }

  /**
   * Uninstall a plugin: optional onUninstall, volume cleanup, row delete.
   * Empty image has no protected natives — every installed row is removable.
   * In-memory code stays loaded until API restart (ADR-0036 append-only hotLoad).
   */
  async uninstall(name: string): Promise<{ name: string }> {
    const row = await this.findByName(name);
    if (!row) throw AppException.notFound('plugin', name);

    const plugin = this.registeredPlugins.find((p) => p.name === name);
    this.contexts.delete(name);

    if (plugin?.onUninstall) {
      try {
        await plugin.onUninstall((this.db as any).$client);
        this.logger.log(`Plugin ${name}: uninstall migrations applied`);
      } catch (err) {
        this.logger.error(`Plugin ${name} onUninstall failed: ${(err as Error).message}`);
        throw AppException.badRequest(`Plugin ${name} uninstall failed`);
      }
    }

    const volumeDir = this.instanceDir();
    const localDir = findMarketplaceLocalDirForPlugin(volumeDir, name);
    if (localDir && !FIRST_PARTY_PLUGIN_DIRS.includes(localDir)) {
      const absDir = join(volumeDir, localDir);
      if (existsSync(absDir)) {
        rmSync(absDir, { recursive: true, force: true });
      }
      removeInstanceManifest(volumeDir, localDir);
    }

    this.unbindPluginHttp(name);

    await this.db.delete(plugins).where(eq(plugins.name, name));
    this.logger.log(`Plugin uninstalled: ${name}`);
    return { name };
  }

  /**
   * Delete a volume plugin directory, its manifest entry, and DB row.
   * Code stays in memory until API restart — disable routes by deleting the row.
   */
  async removeInstance(localDir: string): Promise<{ name: string }> {
    const resolved = this.resolveDirOrSegment(localDir);
    const absDir = pluginVolumeRoot(this.instanceDir(), resolved);
    let name = localDir;
    if (existsSync(absDir)) {
      try {
        name = loadPluginFromDir(absDir).name;
      } catch {
        // Orphan or broken tree — still remove files when no row exists.
      }
    }
    let row = await this.findByName(name);
    if (!row && /^crm_/.test(localDir)) {
      row = await this.findByName(localDir);
      if (row) name = localDir;
    }
    if (row) {
      await this.uninstall(name);
      this.logger.log(`Instance plugin removed from volume: ${resolved} (${name})`);
      return { name };
    }
    if (FIRST_PARTY_PLUGIN_DIRS.includes(resolved)) {
      throw AppException.badRequest(`Reserved plugin directory: ${resolved}`, {
        reason: 'reserved_dir',
      });
    }
    if (existsSync(absDir)) {
      rmSync(absDir, { recursive: true, force: true });
    }
    removeInstanceManifest(this.instanceDir(), resolved);
    this.logger.log(`Instance plugin removed from volume: ${resolved} (${name})`);
    return { name };
  }

  pluginContract(): string {
    return INSTANCE_PLUGIN_CONTRACT;
  }

  scaffold(input: { directory: string; name: string; displayName?: string; nest?: boolean }): {
    directory: string;
    files: string[];
  } {
    if (!/^crm_[a-z0-9_]+$/.test(input.name)) {
      throw AppException.badRequest('name must match crm_[a-z0-9_]+', { reason: 'bad_name' });
    }
    if (this.reservedNames().includes(input.name)) {
      throw AppException.badRequest(`Reserved plugin name: ${input.name}`, {
        reason: 'reserved_name',
      });
    }
    try {
      ensureInstanceDir(this.instanceDir());
      return scaffoldInstancePlugin(this.instanceDir(), {
        ...input,
        nest: input.nest === false ? false : true,
      });
    } catch (err) {
      this.throwAuthoring(err);
    }
  }

  writeFile(
    directory: string,
    path: string,
    content: string,
  ): { directory: string; path: string; bytes: number } {
    try {
      ensureInstanceDir(this.instanceDir());
      const local = this.resolveDirOrSegment(directory);
      return writeInstancePluginFile(this.instanceDir(), local, path, content);
    } catch (err) {
      this.throwAuthoring(err);
    }
  }

  /**
   * Re-jiti a volume plugin already in this process and rebind GET handlers on
   * the HTTP bridge. Nest modules stay in the container (ADR-0036 append-only).
   */
  async reloadFromDirectory(
    localDir: string,
  ): Promise<{ name: string; status: 'reloaded' | 'not_loaded' }> {
    const resolved = this.resolveExistingDir(localDir);
    const absDir = pluginVolumeRoot(this.instanceDir(), resolved);
    if (!existsSync(join(absDir, 'package.json'))) {
      throw AppException.notFound('plugin', resolved);
    }
    const { name } = this.validate(absDir);
    if (!this.loadedNames().includes(name)) {
      return { name, status: 'not_loaded' };
    }

    const plugin = loadPluginFromDir(absDir);
    const idx = this.registeredPlugins.findIndex((p) => p.name === name);
    if (idx >= 0) this.registeredPlugins[idx] = plugin;
    else this.registeredPlugins.push(plugin);

    this.unbindPluginHttp(name);

    const nestModule = plugin.getNestModule?.();
    if (nestModule && this.lazyModuleLoader) {
      await this.lazyModuleLoader.load(() => Promise.resolve(nestModule));
      const paths = await this.pluginHttpRegistrar?.registerModuleRoutes(nestModule, {
        replace: true,
        pluginName: name,
      });
      if (paths?.length) {
        this.logger.log(`Instance plugin ${name} HTTP routes reloaded: ${paths.join(', ')}`);
      }
    }
    return { name, status: 'reloaded' };
  }

  readFile(directory: string, path: string): { directory: string; path: string; content: string } {
    try {
      const local = this.resolveExistingDir(directory);
      return readInstancePluginFile(this.instanceDir(), local, path);
    } catch (err) {
      this.throwAuthoring(err);
    }
  }

  listFiles(directory: string): { directory: string; files: string[] } {
    try {
      const local = this.resolveExistingDir(directory);
      return listInstancePluginFiles(this.instanceDir(), local);
    } catch (err) {
      this.throwAuthoring(err);
    }
  }

  private resolveExistingDir(ref: string): string {
    try {
      return resolveInstancePluginDirectory(this.instanceDir(), ref);
    } catch (err) {
      this.throwAuthoring(err);
    }
  }

  /** Like resolveExistingDir but allows former first-party dir names (marketplace unpack). */
  private resolveDirAllowingReserved(ref: string): string {
    const raw = normalizeInstancePluginRef(ref);
    if (!isSafeLocalSegment(raw)) {
      return this.resolveExistingDir(ref);
    }
    const absDir = pluginVolumeRoot(this.instanceDir(), raw, { allowReservedScaffoldDirs: true });
    if (!existsSync(join(absDir, 'package.json'))) {
      throw AppException.notFound('plugin', raw);
    }
    return raw;
  }

  private resolveDirOrSegment(ref: string): string {
    try {
      return resolveInstancePluginDirectory(this.instanceDir(), ref);
    } catch (err) {
      if ((err as Error).message === 'not_found') {
        const raw = normalizeInstancePluginRef(ref);
        if (isSafeLocalSegment(raw)) return raw;
      }
      this.throwAuthoring(err);
    }
  }

  private throwAuthoring(err: unknown): never {
    if (err instanceof HttpException) throw err;
    const code = (err as Error).message;
    if (code === 'bad_path') {
      throw AppException.badRequest('directory/path must be relative without ..', {
        reason: 'bad_path',
      });
    }
    if (code === 'too_large') {
      throw AppException.badRequest('file exceeds size cap', { reason: 'too_large' });
    }
    if (code === 'too_many_files') {
      throw AppException.badRequest('plugin file cap exceeded', { reason: 'too_many_files' });
    }
    if (code === 'not_found') {
      throw AppException.notFound('file', 'instance-plugin');
    }
    if (code === 'reserved_dir') {
      throw AppException.badRequest('directory is a first-party plugin', {
        reason: 'reserved_dir',
      });
    }
    throw AppException.badRequest((err as Error).message);
  }

  /**
   * Append-only load from the instance volume (ADR-0036). Never unloads.
   * `install()` then writes the `plugins` row and activates.
   */
  async hotLoad(absPackageDir: string): Promise<{ name: string }> {
    try {
      ensureInstanceDir(this.instanceDir());
    } catch (err) {
      this.logger.error(`Instance plugins dir not writable: ${(err as Error).message}`);
      throw AppException.upstreamFailed('instance-plugins');
    }

    const { name } = this.validate(absPackageDir);
    if (this.loadedNames().includes(name)) {
      throw AppException.badRequest(`Plugin ${name} is already loaded in this process`, {
        reason: 'image_collision',
      });
    }

    const plugin = loadPluginFromDir(absPackageDir);
    this.registeredPlugins.push(plugin);
    this.logger.log(`Instance plugin loaded in-process: ${name} v${plugin.version}`);

    try {
      if (!plugin.getNestModule) {
        this.logger.log(`Instance plugin ${name}: no Nest module (UI page needs getNestModule)`);
      }
      // install() binds volume Nest when needed, then writes the row + activates.
      await this.install(name);
      this.logger.log(`Instance plugin installed and enabled: ${name}`);
      return { name };
    } catch (err) {
      const idx = this.registeredPlugins.lastIndexOf(plugin);
      if (idx >= 0) this.registeredPlugins.splice(idx, 1);
      this.unbindPluginHttp(name);
      throw err;
    }
  }

  /**
   * The insert behind install(), with the race mapped onto the same conflict the
   * pre-read produces.
   *
   * Two install clicks can cross between the pre-read and the write; `name` is
   * unique, so one of them loses at the database. Postgres reports 23505, which
   * would otherwise surface as a 500 — the SPA would show "something went wrong"
   * for what is really "already installed".
   */
  private async insertForInstall(plugin: CrmPlugin) {
    try {
      return await this.db
        .insert(plugins)
        .values({
          name: plugin.name,
          displayName: plugin.displayName,
          description: plugin.description ?? null,
          version: plugin.version,
          enabled: true,
          config: {},
        } as any)
        .returning();
    } catch (err) {
      if ((err as { code?: string })?.code === '23505') {
        throw AppException.alreadyExists('plugin', 'name', plugin.name);
      }
      throw err;
    }
  }

  async enable(name: string) {
    const row = await this.findByName(name);
    if (!row) throw AppException.notFound('plugin', name);
    const [updated] = await this.db
      .update(plugins)
      .set({ enabled: true, updatedAt: new Date() } as any)
      .where(eq(plugins.name, name))
      .returning();

    const plugin = this.registeredPlugins.find((p) => p.name === name);
    if (plugin) {
      // Same activate() as boot and install — the migrate → context → onInit
      // sequence exists in one place instead of three.
      const ok = await this.activate(plugin, updated);
      if (!ok) {
        // Roll back enable so the UI does not show a broken plugin as active.
        await this.db
          .update(plugins)
          .set({ enabled: false, updatedAt: new Date() } as any)
          .where(eq(plugins.name, name));
        this.contexts.delete(name);
        throw AppException.badRequest(`Plugin ${name} migration failed`);
      }
    }
    return this.enrichRow(updated);
  }

  async disable(name: string) {
    const row = await this.findByName(name);
    if (!row) throw AppException.notFound('plugin', name);
    const [updated] = await this.db
      .update(plugins)
      .set({ enabled: false, updatedAt: new Date() } as any)
      .where(eq(plugins.name, name))
      .returning();
    this.contexts.delete(name);
    return this.enrichRow(updated);
  }

  async updateConfig(name: string, config: Record<string, string>) {
    const row = await this.findByName(name);
    if (!row) throw AppException.notFound('plugin', name);
    const [updated] = await this.db
      .update(plugins)
      .set({ config, updatedAt: new Date() } as any)
      .where(eq(plugins.name, name))
      .returning();
    // rebuild context with new config
    if (this.contexts.has(name)) {
      const ctx = this.buildContext(name, config);
      this.contexts.set(name, ctx);
      const plugin = this.registeredPlugins.find((p) => p.name === name);
      if (plugin?.onInit) await Promise.resolve(plugin.onInit(ctx)).catch(() => null);
    }
    return this.enrichRow(updated);
  }

  // ─── helpers ───────────────────────────────────────────────────────────────

  private buildContext(pluginName: string, config: Record<string, string>): PluginContext {
    const logger = new Logger(`Plugin:${pluginName}`);
    return {
      log: (msg: string, ...args: unknown[]) => logger.log(msg, ...args),
      config,
    };
  }
}
