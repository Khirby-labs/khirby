import { Module } from '@nestjs/common';
import { RbacModule } from '../../core/rbac/rbac.module';
import { ContactsModule } from '../contacts/contacts.module';
import { LeadsModule } from '../leads/leads.module';
import { BoardsModule } from '../boards/boards.module';
import { MailModule } from '../mail/mail.module';
import { AgentChatController } from './agent-chat.controller';
import { AgentConversationsController } from './agent-conversations.controller';
import { AgentChatService } from './agent-chat.service';
import { AgentConversationsService } from './agent-conversations.service';
import { CrmToolsAdapter } from './tools/crm-tools.adapter';
import { MailToolsAdapter } from './tools/mail-tools.adapter';
import { PluginToolsAdapter, PokeloToolsAdapter } from './tools/plugin-tools.adapter';

@Module({
  imports: [RbacModule, ContactsModule, LeadsModule, BoardsModule, MailModule],
  controllers: [AgentChatController, AgentConversationsController],
  providers: [
    AgentChatService,
    AgentConversationsService,
    CrmToolsAdapter,
    MailToolsAdapter,
    PluginToolsAdapter,
    PokeloToolsAdapter,
  ],
})
export class AgentModule {}
