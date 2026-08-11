import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsInt,
  IsArray,
  IsIn,
  MinLength,
  MaxLength,
} from 'class-validator';
import { TasksService, type TaskPriority } from './tasks.service';
import { SessionGuard } from '../../../core/auth/session.guard';
import { PermissionGuard } from '../../../core/rbac/rbac.guard';
import { RequirePermission } from '../../../core/rbac/require-permission.decorator';
import { AppException } from '../../../core/errors/app-exception';

type SessionRequest = { session: { userId?: string } };

class CreateTaskBody {
  @IsUUID() moduleId!: string;
  @IsString() @MinLength(1) @MaxLength(500) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(['low', 'medium', 'high', 'urgent']) priority?: TaskPriority;
  @IsOptional() @IsUUID() statusId?: string;
  @IsOptional() @IsUUID() parentTaskId?: string;
  @IsOptional() @IsString() dueDate?: string | null;
  @IsOptional() @IsUUID() leadId?: string | null;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) assigneeIds?: string[];
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) tagIds?: string[];
}

class UpdateTaskBody {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500) title?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsIn(['low', 'medium', 'high', 'urgent']) priority?: TaskPriority;
  @IsOptional() @IsUUID() statusId?: string | null;
  @IsOptional() @IsString() dueDate?: string | null;
  @IsOptional() @IsUUID() leadId?: string | null;
  @IsOptional() @IsUUID() moduleId?: string;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) assigneeIds?: string[];
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) tagIds?: string[];
}

class UpdateStatusBody {
  @IsUUID() statusId!: string;
  @IsInt() position!: number;
}

class CommentBody {
  @IsString() @MinLength(1) @MaxLength(5000) body!: string;
}

@ApiTags('boards')
@ApiBearerAuth('session')
@Controller('boards/tasks')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('boards', 'manage')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('my')
  findMy(@Req() req: SessionRequest) {
    const userId = req.session.userId;
    if (!userId) throw AppException.sessionExpired();
    return this.tasks.findMyTasks(userId);
  }

  @Get('by/:identifier')
  findByIdentifier(@Param('identifier') identifier: string) {
    return this.tasks.findByIdentifier(identifier);
  }

  @Get()
  findByProject(
    @Query('projectId') projectId: string,
    @Query('moduleId') moduleId?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('priority') priority?: string,
    @Query('statusId') statusId?: string,
    @Query('tagId') tagId?: string,
  ) {
    if (!projectId) return [];
    return this.tasks.findByProject(projectId, {
      moduleId,
      assigneeId,
      priority,
      statusId,
      tagId,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tasks.findByRef(id);
  }

  @Get(':id/activity')
  getActivity(@Param('id') id: string) {
    return this.tasks.getActivity(id);
  }

  @Post()
  create(@Body() dto: CreateTaskBody, @Req() req: SessionRequest) {
    const userId = req.session.userId;
    if (!userId) throw AppException.sessionExpired();
    return this.tasks.create(dto, userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskBody, @Req() req: SessionRequest) {
    const userId = req.session.userId;
    if (!userId) throw AppException.sessionExpired();
    return this.tasks.update(id, dto, userId);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusBody, @Req() req: SessionRequest) {
    const userId = req.session.userId;
    if (!userId) throw AppException.sessionExpired();
    return this.tasks.updateStatus(id, dto.statusId, dto.position, userId);
  }

  @Post(':id/comments')
  addComment(@Param('id') id: string, @Body() dto: CommentBody, @Req() req: SessionRequest) {
    const userId = req.session.userId;
    if (!userId) throw AppException.sessionExpired();
    return this.tasks.addComment(id, dto.body, userId);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.tasks.delete(id);
  }
}
