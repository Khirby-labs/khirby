import { Module } from '@nestjs/common';
import { NewsletterController } from './newsletter.controller';
import { NewsletterService } from './newsletter.service';
import { ListmonkAdapter } from './listmonk.adapter';
import { RbacModule } from '../../core/rbac/rbac.module';

@Module({
  imports: [RbacModule],
  controllers: [NewsletterController],
  providers: [NewsletterService, ListmonkAdapter],
  exports: [NewsletterService, ListmonkAdapter],
})
export class NewsletterModule {}
