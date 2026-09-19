import { Module } from '@nestjs/common';
import { InquiryController } from './inquiry.controller';
import { InquiryService } from './inquiry.service';
import { ContactsModule } from '../contacts/contacts.module';
import { LeadsModule } from '../leads/leads.module';
import { RbacModule } from '../../core/rbac/rbac.module';

@Module({
  imports: [ContactsModule, LeadsModule, RbacModule],
  controllers: [InquiryController],
  providers: [InquiryService],
  exports: [InquiryService],
})
export class InquiryModule {}
