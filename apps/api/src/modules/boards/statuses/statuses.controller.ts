import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsUUID,
  IsArray,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { StatusesService } from './statuses.service';
import { SessionGuard } from '../../../core/auth/session.guard';
import { PermissionGuard } from '../../../core/rbac/rbac.guard';
import { RequirePermission } from '../../../core/rbac/require-permission.decorator';

class CreateStatusBody {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() moduleId?: string;
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) color?: string;
  @IsOptional() @IsInt() position?: number;
  @IsOptional() @IsBoolean() isBacklog?: boolean;
  @IsOptional() @IsBoolean() isDone?: boolean;
  @IsOptional() @IsBoolean() isCanceled?: boolean;
}

class UpdateStatusBody {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) color?: string;
  @IsOptional() @IsBoolean() isBacklog?: boolean;
  @IsOptional() @IsBoolean() isDone?: boolean;
  @IsOptional() @IsBoolean() isCanceled?: boolean;
}

class ReorderBody {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() moduleId?: string;
  @IsArray() @IsUUID('4', { each: true }) ids!: string[];
}

@ApiTags('boards')
@ApiBearerAuth('session')
@Controller('boards/statuses')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('boards', 'manage')
export class StatusesController {
  constructor(private readonly statuses: StatusesService) {}

  @Get()
  find(@Query('projectId') projectId?: string, @Query('moduleId') moduleId?: string) {
    if (moduleId) return this.statuses.findByModule(moduleId);
    if (projectId) return this.statuses.findByProject(projectId);
    return [];
  }

  @Post()
  create(@Body() dto: CreateStatusBody) {
    return this.statuses.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStatusBody) {
    return this.statuses.update(id, dto);
  }

  @Post('reorder')
  reorder(@Body() body: ReorderBody) {
    return this.statuses.reorder(body.ids, {
      projectId: body.projectId,
      moduleId: body.moduleId,
    });
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.statuses.delete(id);
  }
}
