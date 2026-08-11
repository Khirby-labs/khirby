import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import { plugins } from '../../core/database/schema';
import { CrmPlugin, CrmEvent, PluginContext, CRM_PLUGINS } from '@khirby/plugin-sdk';
import { AppException } from '../../core/errors/app-exception';

@Injectable()
export class PluginRegistryService implements OnModuleInit {
  private readonly logger = new Logger(PluginRegistryService.name);
  private readonly contexts = new Map<string, PluginContext>();

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    @Inject(CRM_PLUGINS) private readonly registeredPlugins: CrmPlugin[],
  ) {}

  async onModuleInit() {
    for (const plugin of this.registeredPlugins) {
      await this.registerPlugin(plugin);
    }
  }

  /** Upsert rekordu w DB i wywołaj onInit jeśli plugin jest włączony */
  private async registerPlugin(plugin: CrmPlugin): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(plugins)
      .where(eq(plugins.name, plugin.name))
      .limit(1);

    if (!existing) {
      await this.db.insert(plugins).values({
        name: plugin.name,
        displayName: plugin.displayName,
        description: plugin.description ?? null,
        version: plugin.version,
        enabled: true,
        config: {},
      } as any);
      this.logger.log(`Plugin installed: ${plugin.name} v${plugin.version}`);
    } else if (existing.version !== plugin.version) {
      await this.db
        .update(plugins)
        .set({ version: plugin.version, updatedAt: new Date() } as any)
        .where(eq(plugins.name, plugin.name));
      this.logger.log(`Plugin updated: ${plugin.name} ${existing.version} → ${plugin.version}`);
    }

    const row =
      existing ??
      (await this.db.select().from(plugins).where(eq(plugins.name, plugin.name)).limit(1))[0];

    // Migrations run regardless of enabled — tables must exist when the plugin
    // is later turned on (ADR: plugin-owned schema via onMigrate).
    let migrateOk = true;
    if (plugin.onMigrate) {
      try {
        await plugin.onMigrate((this.db as any).$client);
        this.logger.log(`Plugin ${plugin.name}: migrations applied`);
      } catch (err) {
        migrateOk = false;
        this.logger.error(`Plugin ${plugin.name} onMigrate failed: ${(err as Error).message}`);
      }
    }

    if (!row || !row.enabled) return;

    // Do not init a plugin whose schema failed to apply — controllers may still
    // be registered, but event handlers and onInit side-effects stay off.
    if (!migrateOk) return;

    const ctx = this.buildContext(plugin.name, row.config ?? {});
    this.contexts.set(plugin.name, ctx);

    if (plugin.onInit) {
      try {
        await plugin.onInit(ctx);
      } catch (err) {
        this.logger.error(`Plugin ${plugin.name} onInit failed: ${(err as Error).message}`);
      }
    }
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
            navLabel,
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
    };
  }

  async findAll() {
    const rows = await this.db.select().from(plugins);
    return rows.map((row) => this.enrichRow(row));
  }

  async findByName(name: string) {
    const [row] = await this.db.select().from(plugins).where(eq(plugins.name, name)).limit(1);
    return row ?? null;
  }

  /** True when the plugin has an active in-memory context (enabled + migrated + inited). */
  isEnabled(name: string): boolean {
    return this.contexts.has(name);
  }

  async enable(name: string) {
    const row = await this.findByName(name);
    if (!row) throw AppException.notFound('plugin', name);
    const [updated] = await this.db
      .update(plugins)
      .set({ enabled: true, updatedAt: new Date() } as any)
      .where(eq(plugins.name, name))
      .returning();
    // re-init context
    const plugin = this.registeredPlugins.find((p) => p.name === name);
    if (plugin) {
      if (plugin.onMigrate) {
        try {
          await plugin.onMigrate((this.db as any).$client);
        } catch (err) {
          this.logger.error(`Plugin ${name} onMigrate failed: ${(err as Error).message}`);
          // Roll back enable so the UI does not show a broken plugin as active.
          await this.db
            .update(plugins)
            .set({ enabled: false, updatedAt: new Date() } as any)
            .where(eq(plugins.name, name));
          this.contexts.delete(name);
          throw AppException.badRequest(`Plugin ${name} migration failed`);
        }
      }
      const ctx = this.buildContext(name, updated.config ?? {});
      this.contexts.set(name, ctx);
      if (plugin.onInit) await Promise.resolve(plugin.onInit(ctx)).catch(() => null);
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
