import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { CustomFieldsController } from './custom-fields.controller';
import { CustomFieldsService } from './custom-fields.service';
import { RbacModule } from '../../core/rbac/rbac.module';

@Module({
  imports: [RbacModule],
  controllers: [ContactsController, CustomFieldsController],
  providers: [ContactsService, CustomFieldsService],
  exports: [ContactsService, CustomFieldsService],
})
export class ContactsModule {}
