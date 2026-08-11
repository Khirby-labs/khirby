import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { DatabaseModule } from './core/database/database.module';
import { AuthModule } from './core/auth/auth.module';
import { RbacModule } from './core/rbac/rbac.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { FormsModule } from './modules/forms/forms.module';
import { LeadsModule } from './modules/leads/leads.module';
import { BoardsModule } from './modules/boards/boards.module';
import { RolesModule } from './modules/roles/roles.module';
import { UsersModule } from './modules/users/users.module';
import { PluginsModule } from './modules/plugins/plugins.module';
import { loadPlugins } from './modules/plugins/load-plugins';
import { HealthModule } from './core/health/health.module';
import { EventsModule } from './core/events/events.module';
import { MailModule } from './modules/mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    DatabaseModule,
    AuthModule,
    RbacModule,
    EventsModule,
    ContactsModule,
    FormsModule,
    LeadsModule,
    BoardsModule,
    RolesModule,
    UsersModule,
    PluginsModule.forRoot(loadPlugins()),
    HealthModule,
    MailModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
