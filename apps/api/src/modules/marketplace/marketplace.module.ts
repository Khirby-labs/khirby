import { Module } from '@nestjs/common';
import { RbacModule } from '../../core/rbac/rbac.module';
import { ControlPlaneModule } from '../control-plane/control-plane.module';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceCatalogService } from './marketplace-catalog.service';
import { MarketplaceService } from './marketplace.service';
import { PluginPackageInstaller } from './plugin-package.installer';

/**
 * RbacModule supplies SessionGuard and PermissionGuard. PluginRegistryService needs
 * no import here: `PluginsModule.forRoot` is registered global and exports it.
 * ConfigService likewise comes from the global ConfigModule.
 * ControlPlaneModule exports the HTTP client + installation identity for catalog
 * fetch, npm install metadata, and submissions.
 */
@Module({
  imports: [RbacModule, ControlPlaneModule],
  controllers: [MarketplaceController],
  providers: [MarketplaceCatalogService, MarketplaceService, PluginPackageInstaller],
  exports: [MarketplaceCatalogService, MarketplaceService],
})
export class MarketplaceModule {}
