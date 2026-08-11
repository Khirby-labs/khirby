import { Module } from '@nestjs/common';
import { RbacModule } from '../../core/rbac/rbac.module';
import { EventsModule } from '../../core/events/events.module';
import { ProjectsService } from './projects/projects.service';
import { ProjectsController } from './projects/projects.controller';
import { ModulesService } from './modules/modules.service';
import { ModulesController } from './modules/modules.controller';
import { TasksService } from './tasks/tasks.service';
import { TasksController } from './tasks/tasks.controller';
import { StatusesService } from './statuses/statuses.service';
import { StatusesController } from './statuses/statuses.controller';
import { TagsService } from './tags/tags.service';
import { TagsController } from './tags/tags.controller';
import { BoardController } from './board.controller';
import { CanceledTasksPurgeWorker } from './tasks/canceled-tasks-purge.worker';

@Module({
  imports: [RbacModule, EventsModule],
  providers: [
    ProjectsService,
    ModulesService,
    TasksService,
    StatusesService,
    TagsService,
    CanceledTasksPurgeWorker,
  ],
  controllers: [
    ProjectsController,
    ModulesController,
    TasksController,
    StatusesController,
    TagsController,
    BoardController,
  ],
  exports: [ProjectsService, ModulesService, TasksService, StatusesService],
})
export class BoardsModule {}
