import { Module } from '@nestjs/common';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';
import { FormsStatsService } from './forms-stats.service';
import { PublicFormsController } from './public-forms.controller';
import { ContactsModule } from '../contacts/contacts.module';
import { LeadsModule } from '../leads/leads.module';
import { RbacModule } from '../../core/rbac/rbac.module';

@Module({
  imports: [ContactsModule, LeadsModule, RbacModule],
  controllers: [FormsController, PublicFormsController],
  providers: [FormsService, FormsStatsService],
})
export class FormsModule {}
