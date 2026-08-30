import { Module } from '@nestjs/common';
import { RbacModule } from '../../core/rbac/rbac.module';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceCatalogService } from './marketplace-catalog.service';
import { MarketplaceService } from './marketplace.service';

/**
 * RbacModule supplies SessionGuard and PermissionGuard. PluginRegistryService needs
 * no import here: `PluginsModule.forRoot` is registered global and exports it.
 * ConfigService likewise comes from the global ConfigModule.
 */
@Module({
  imports: [RbacModule],
  controllers: [MarketplaceController],
  providers: [MarketplaceCatalogService, MarketplaceService],
  exports: [MarketplaceCatalogService, MarketplaceService],
})
export class MarketplaceModule {}
