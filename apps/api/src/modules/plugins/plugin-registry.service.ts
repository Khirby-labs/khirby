import { Injectable, Inject, OnModuleInit, Logger, Optional, HttpException } from '@nestjs/common';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
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
  defaultInstancePluginsDir,
  ensureInstanceDir,
  findInstanceLocalDirForPlugin,
  listInstancePluginFiles,
  loadPluginFromDir,
  pluginVolumeRoot,
  readInstancePluginFile,
  readPackageName,
  removeInstanceManifest,
  scaffoldInstancePlugin,
  writeInstancePluginFile,
} from './instance-plugins.loader';
import { INSTANCE_PLUGIN_CONTRACT } from './instance-plugin-contract';
import { PluginNestHttpRegistrar } from './plugin-nest-http.registrar';
import { InstancePluginHttpBridge } from './instance-plugin-http.bridge';

type PluginRow = typeof plugins.$inferSelect;

/**
 * The plugins a FIRST boot installs, so a fresh instance looks exactly like it
 * did before the Marketplace existed (ADR-0032).
 *
 * An explicit constant on purpose. "Everything the loader returns" would make
 * every future plugin self-install, which is the opposite of what a marketplace
 * is for; a flag in the catalog would tie the first boot to a document fetched
 * over the network, so an instance without internet would come up with no
 * plugins at all.
 */
export const NATIVE_PLUGIN_NAMES = [
  'crm_webhook',
  'crm_discord',
  'crm_listmonk',
  'crm_mcp',
  'crm_ai_compose',
  'crm_pokelo',
] as const;

/** Image natives plus the in-repo example — instance scaffold must not reuse them. */
export const RESERVED_INSTANCE_PLUGIN_NAMES: readonly string[] = [
  ...NATIVE_PLUGIN_NAMES,
  'crm_hello',
];

export function isNativePlugin(name: string): boolean {
  return (NATIVE_PLUGIN_NAMES as readonly string[]).includes(name);
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

  /**
   * Boot no longer installs anything: a row in `plugins` IS the installation
   * (ADR-0032), so a plugin present in the image without a row stays "available"
   * until the operator installs it from the Marketplace.
   *
   * The one exception is a genuinely first boot — an entirely empty table — which
   * seeds the native set. The condition is "the table is empty", never "this
   * plugin has no row": the latter would resurrect anything an operator removed.
   */
  async onModuleInit() {
    const rows = await this.db.select().from(plugins);

    if (rows.length === 0) {
      await this.seedNativePlugins();
      return;
    }

    const byName = new Map(rows.map((row) => [row.name, row]));
    for (const plugin of this.registeredPlugins) {
      const row = byName.get(plugin.name);
      // No row → available, not installed. Its Nest module is still mounted
      // (PluginsModule.forRoot mounts unconditionally), but isEnabled() stays
      // false, so PluginEnabledGuard answers 503.
      if (!row) continue;
      await this.syncInstalledPlugin(plugin, row);
    }

    await this.bindVolumePluginHttp();
  }

  /**
   * GET /api/plugins/:segment is owned by InstancePluginHttpBridgeController.
   * Fastify matches that parametric route instead of the static Nest path from
   * forRoot, so volume plugins must also bind handlers on the bridge at boot.
   */
  private async bindVolumePluginHttp(): Promise<void> {
    for (const plugin of this.registeredPlugins) {
      if (isNativePlugin(plugin.name)) continue;
      const nestModule = plugin.getNestModule?.();
      if (!nestModule) continue;
      const paths = await this.pluginHttpRegistrar?.registerModuleRoutes(nestModule, {
        pluginName: plugin.name,
      });
      if (paths?.length) {
        this.logger.log(`Instance plugin ${plugin.name} HTTP routes: ${paths.join(', ')}`);
      }
    }
  }

  /** Seed the native set on a first boot, then bring each one up. */
  private async seedNativePlugins(): Promise<void> {
    const registry = new Map(this.registeredPlugins.map((p) => [p.name, p]));
    let seeded = 0;

    for (const name of NATIVE_PLUGIN_NAMES) {
      const plugin = registry.get(name);
      if (!plugin) {
        // Intersect with the registry rather than seeding names blindly: this
        // row's displayName and version can only come from the instance.
        this.logger.warn(`Native plugin ${name} is absent from this image — not seeded`);
        continue;
      }
      const row = await this.insertRow(plugin);
      if (!row) continue;
      await this.activate(plugin, row);
      seeded++;
    }

    this.logger.log(`First boot: seeded ${seeded} native plugin(s)`);
    await this.bindVolumePluginHttp();
  }

  /**
   * Insert the row for `plugin`, tolerating a concurrent writer.
   *
   * Two app containers overlap during a rolling deploy (`docker-stack.yml` uses
   * `order: start-first`), so both can see an empty table and both seed. `name`
   * is unique, so the loser's insert is a no-op that returns no row — and it
   * must then read the winner's row and carry on. Bailing out there would leave
   * this process with rows in the database and no in-memory context, and emit()
   * skips context-less plugins: every event in that replica would be dropped
   * silently, which is worse than the crash this guards against.
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
    return {
      ...row,
      displayNameKey: plugin?.displayNameKey,
      descriptionKey: plugin?.descriptionKey,
      frontendRoutes,
      configSchema,
      codeLoaded: !!plugin,
      canUninstall: !isNativePlugin(row.name),
    };
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

  /**
   * Install a plugin that is present in this process but has no row.
   *
   * No code is loaded: the Nest module is already mounted, so all that moves is
   * the row plus the in-memory context. That is what lets a Marketplace install
   * take effect without restarting the process while ADR-0016's ban on reloading
   * a DynamicModule at runtime still holds.
   */
  async install(name: string) {
    const plugin = this.registeredPlugins.find((p) => p.name === name);
    // Not in this image — nothing to install, and nothing written.
    if (!plugin) throw AppException.notFound('plugin', name);

    const existing = await this.findByName(name);
    if (existing) throw AppException.alreadyExists('plugin', 'name', name);

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
      return pluginVolumeRoot(this.instanceDir(), directory);
    } catch (err) {
      this.throwAuthoring(err);
    }
  }

  reservedNames(): readonly string[] {
    return RESERVED_INSTANCE_PLUGIN_NAMES;
  }

  validate(absPackageDir: string): { name: string } {
    try {
      const plugin = loadPluginFromDir(absPackageDir);
      if (RESERVED_INSTANCE_PLUGIN_NAMES.includes(plugin.name)) {
        throw AppException.badRequest(`Reserved plugin name: ${plugin.name}`, {
          reason: 'reserved_name',
        });
      }
      return { name: plugin.name };
    } catch (err) {
      const message =
        err instanceof Error ? err.message || err.name || 'Plugin validation failed' : String(err);
      const errName = (err as Error).name;
      if (errName === 'web_not_hot_loadable' || message === 'web_not_hot_loadable') {
        throw AppException.badRequest('Vue ./web is not hot-loadable on an instance volume', {
          reason: 'web_not_hot_loadable',
        });
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
   */
  async installFromDirectory(
    localDir: string,
    packageName?: string,
  ): Promise<{ name: string; status: 'installed' | 're-enabled' | 'already_active' }> {
    const absDir = this.packageDir(localDir);
    const { name } = this.validate(absDir);
    const pkgName = packageName?.trim() || readPackageName(absDir);
    this.appendManifest(pkgName, localDir);

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
    await this.reloadFromDirectory(localDir);
    return { name, status: 'already_active' };
  }

  /**
   * Uninstall a non-native plugin: optional onUninstall, volume cleanup, row delete.
   * In-memory code stays loaded until API restart (ADR-0036 append-only hotLoad).
   */
  async uninstall(name: string): Promise<{ name: string }> {
    if (isNativePlugin(name)) {
      throw AppException.badRequest(`Native plugin ${name} cannot be uninstalled`, {
        reason: 'native_plugin',
      });
    }

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
    const localDir = findInstanceLocalDirForPlugin(volumeDir, name);
    if (localDir) {
      const absDir = join(volumeDir, localDir);
      if (existsSync(absDir)) {
        rmSync(absDir, { recursive: true, force: true });
      }
      removeInstanceManifest(volumeDir, localDir);
    }

    this.instanceBridge?.unregisterPlugin(name);

    await this.db.delete(plugins).where(eq(plugins.name, name));
    this.logger.log(`Plugin uninstalled: ${name}`);
    return { name };
  }

  /**
   * Delete a volume plugin directory, its manifest entry, and DB row.
   * Code stays in memory until API restart — disable routes by deleting the row.
   */
  async removeInstance(localDir: string): Promise<{ name: string }> {
    const absDir = this.packageDir(localDir);
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
      this.logger.log(`Instance plugin removed from volume: ${localDir} (${name})`);
      return { name };
    }
    if (existsSync(absDir)) {
      rmSync(absDir, { recursive: true, force: true });
    }
    removeInstanceManifest(this.instanceDir(), localDir);
    this.logger.log(`Instance plugin removed from volume: ${localDir} (${name})`);
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
      return scaffoldInstancePlugin(this.instanceDir(), input);
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
      return writeInstancePluginFile(this.instanceDir(), directory, path, content);
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
    const absDir = this.packageDir(localDir);
    if (!existsSync(join(absDir, 'package.json'))) {
      throw AppException.notFound('plugin', localDir);
    }
    const { name } = this.validate(absDir);
    if (!this.loadedNames().includes(name)) {
      return { name, status: 'not_loaded' };
    }

    const plugin = loadPluginFromDir(absDir);
    const idx = this.registeredPlugins.findIndex((p) => p.name === name);
    if (idx >= 0) this.registeredPlugins[idx] = plugin;
    else this.registeredPlugins.push(plugin);

    this.instanceBridge?.unregisterPlugin(name);

    require('reflect-metadata');
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
      return readInstancePluginFile(this.instanceDir(), directory, path);
    } catch (err) {
      this.throwAuthoring(err);
    }
  }

  listFiles(directory: string): { directory: string; files: string[] } {
    try {
      return listInstancePluginFiles(this.instanceDir(), directory);
    } catch (err) {
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
      require('reflect-metadata');
      const nestModule = plugin.getNestModule?.();
      if (nestModule && this.lazyModuleLoader) {
        await this.lazyModuleLoader.load(() => Promise.resolve(nestModule));
        const paths = await this.pluginHttpRegistrar?.registerModuleRoutes(nestModule, {
          pluginName: name,
        });
        if (paths?.length) {
          this.logger.log(`Instance plugin ${name} HTTP routes: ${paths.join(', ')}`);
        } else {
          this.logger.warn(
            `Instance plugin ${name}: Nest module loaded but no HTTP routes were registered`,
          );
        }
      } else if (nestModule && !this.lazyModuleLoader) {
        this.logger.warn(`Instance plugin ${name}: LazyModuleLoader unavailable — HTTP not wired`);
      } else {
        this.logger.log(`Instance plugin ${name}: no Nest module (UI page needs getNestModule)`);
      }

      await this.install(name);
      this.logger.log(`Instance plugin installed and enabled: ${name}`);
      return { name };
    } catch (err) {
      const idx = this.registeredPlugins.lastIndexOf(plugin);
      if (idx >= 0) this.registeredPlugins.splice(idx, 1);
      this.instanceBridge?.unregisterPlugin(name);
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
