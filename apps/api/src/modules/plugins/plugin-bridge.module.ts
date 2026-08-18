import { Global, Module, forwardRef } from '@nestjs/common';
import {
  CONTACTS_SERVICE,
  LEADS_SERVICE,
  USERS_SERVICE,
  PIPELINE_STAGES_SERVICE,
  EVENTS_SERVICE,
  MAIL_THREAD_SERVICE,
  MAIL_SEND_SERVICE,
  BOARD_PROJECTS_SERVICE,
  BOARD_MODULES_SERVICE,
  BOARD_TASKS_SERVICE,
  BOARD_STATUSES_SERVICE,
  RBAC_SERVICE,
} from '../../../../../packages/plugin-host/src';
import { RbacModule } from '../../core/rbac/rbac.module';
import { RbacService } from '../../core/rbac/rbac.service';
import { ContactsModule } from '../contacts/contacts.module';
import { ContactsService } from '../contacts/contacts.service';
import { LeadsModule } from '../leads/leads.module';
import { LeadsService } from '../leads/leads.service';
import { PipelineStagesService } from '../leads/pipeline-stages.service';
import { EventsModule } from '../../core/events/events.module';
import { EventsService } from '../../core/events/events.service';
import { MailModule } from '../mail/mail.module';
import { MailThreadService } from '../mail/mail-thread.service';
import { MailSendService } from '../mail/mail-send.service';
import { BoardsModule } from '../boards/boards.module';
import { ProjectsService } from '../boards/projects/projects.service';
import { ModulesService } from '../boards/modules/modules.service';
import { TasksService } from '../boards/tasks/tasks.service';
import { StatusesService } from '../boards/statuses/statuses.service';
import { UsersModule } from '../users/users.module';
import { UsersService } from '../users/users.service';

/**
 * Global DI bridge so Nest plugins resolve host services via @khirby/plugin-host
 * tokens without importing apps/api modules (ADR-0016).
 * PLUGIN_REGISTRY + PluginEnabledGuard are provided by PluginsModule.forRoot.
 */
@Global()
@Module({
  imports: [
    RbacModule,
    forwardRef(() => ContactsModule),
    forwardRef(() => LeadsModule),
    EventsModule,
    forwardRef(() => MailModule),
    forwardRef(() => BoardsModule),
    forwardRef(() => UsersModule),
  ],
  providers: [
    { provide: RBAC_SERVICE, useExisting: RbacService },
    { provide: CONTACTS_SERVICE, useExisting: ContactsService },
    { provide: LEADS_SERVICE, useExisting: LeadsService },
    { provide: USERS_SERVICE, useExisting: UsersService },
    { provide: PIPELINE_STAGES_SERVICE, useExisting: PipelineStagesService },
    { provide: EVENTS_SERVICE, useExisting: EventsService },
    { provide: MAIL_THREAD_SERVICE, useExisting: MailThreadService },
    { provide: MAIL_SEND_SERVICE, useExisting: MailSendService },
    { provide: BOARD_PROJECTS_SERVICE, useExisting: ProjectsService },
    { provide: BOARD_MODULES_SERVICE, useExisting: ModulesService },
    { provide: BOARD_TASKS_SERVICE, useExisting: TasksService },
    { provide: BOARD_STATUSES_SERVICE, useExisting: StatusesService },
  ],
  exports: [
    RBAC_SERVICE,
    CONTACTS_SERVICE,
    LEADS_SERVICE,
    USERS_SERVICE,
    PIPELINE_STAGES_SERVICE,
    EVENTS_SERVICE,
    MAIL_THREAD_SERVICE,
    MAIL_SEND_SERVICE,
    BOARD_PROJECTS_SERVICE,
    BOARD_MODULES_SERVICE,
    BOARD_TASKS_SERVICE,
    BOARD_STATUSES_SERVICE,
    RbacModule,
  ],
})
export class PluginBridgeModule {}
