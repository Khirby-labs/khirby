import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import { newsletterLists } from '../../core/database/schema';
import { PluginRegistryService } from '../plugins/plugin-registry.service';
import { AppException } from '../../core/errors/app-exception';

const LISTMONK_PLUGIN = 'crm_listmonk';

@Injectable()
export class NewsletterService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private registry: PluginRegistryService,
  ) {}

  private async assertPluginEnabled(): Promise<void> {
    const plugin = await this.registry.findByName(LISTMONK_PLUGIN);
    if (!plugin || !plugin.enabled) {
      throw AppException.pluginRequired(
        LISTMONK_PLUGIN,
        'Newsletter requires the Listmonk plugin to be installed and enabled.',
      );
    }
  }

  async getLists() {
    await this.assertPluginEnabled();
    return this.db.select().from(newsletterLists);
  }

  async createList(dto: { listmonkListId: string; name: string }) {
    await this.assertPluginEnabled();
    const [created] = await this.db
      .insert(newsletterLists)
      .values({ listmonkListId: dto.listmonkListId, name: dto.name })
      .returning();
    return created;
  }

  async deleteList(id: string) {
    await this.assertPluginEnabled();
    const [deleted] = await this.db
      .delete(newsletterLists)
      .where(eq(newsletterLists.id, id))
      .returning();
    if (!deleted) throw AppException.notFound('newsletterList', id);
  }

  /** Sprawdza czy plugin jest aktywny (używane przez frontend do ukrycia taba) */
  async isPluginEnabled(): Promise<boolean> {
    const plugin = await this.registry.findByName(LISTMONK_PLUGIN);
    return !!plugin?.enabled;
  }
}
