import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../core/database/database.module';
import { RbacModule } from '../../core/rbac/rbac.module';
import { LeadsModule } from '../leads/leads.module';
import { MailboxService } from './mailbox.service';
import { MailboxController } from './mailbox.controller';
import { MailThreadService } from './mail-thread.service';
import { MailSendService } from './mail-send.service';
import { MailIdleWorker } from './mail-idle.worker';
import { MailController } from './mail.controller';

@Module({
  imports: [DatabaseModule, RbacModule, LeadsModule],
  controllers: [MailboxController, MailController],
  providers: [MailboxService, MailThreadService, MailSendService, MailIdleWorker],
  exports: [MailboxService, MailThreadService, MailSendService],
})
export class MailModule {}
