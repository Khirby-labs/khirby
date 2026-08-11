import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { RbacModule } from '../../core/rbac/rbac.module';

@Module({ imports: [RbacModule], controllers: [ContactsController], providers: [ContactsService], exports: [ContactsService] })
export class ContactsModule {}
