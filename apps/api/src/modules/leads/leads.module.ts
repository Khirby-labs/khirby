import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { PipelineStagesController } from './pipeline-stages.controller';
import { LeadsService } from './leads.service';
import { PipelineStagesService } from './pipeline-stages.service';
import { ContactsModule } from '../contacts/contacts.module';
import { RbacModule } from '../../core/rbac/rbac.module';

@Module({
  imports: [ContactsModule, RbacModule],
  controllers: [LeadsController, PipelineStagesController],
  providers: [LeadsService, PipelineStagesService],
  exports: [LeadsService, PipelineStagesService],
})
export class LeadsModule {}
