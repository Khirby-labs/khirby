import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TasksService } from './tasks/tasks.service';
import { SessionGuard } from '../../core/auth/session.guard';
import { PermissionGuard } from '../../core/rbac/rbac.guard';
import { RequirePermission } from '../../core/rbac/require-permission.decorator';

@ApiTags('boards')
@ApiBearerAuth('session')
@Controller('boards')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('boards', 'manage')
export class BoardController {
  constructor(private readonly tasks: TasksService) {}

  /** Module kanban board: statuses + top-level tasks */
  @Get('modules/:moduleId/board')
  getModuleBoard(@Param('moduleId') moduleId: string) {
    return this.tasks.findByModule(moduleId);
  }

  /** Users that can be assigned to tasks (id + email). */
  @Get('assignees')
  getAssignees() {
    return this.tasks.getAssignees();
  }

  /** Project aggregate task list */
  @Get('projects/:projectId/tasks')
  getProjectTasks(@Param('projectId') projectId: string) {
    return this.tasks.findByProject(projectId);
  }
}
