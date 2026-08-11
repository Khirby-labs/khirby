import { Controller, Get, Post, Patch, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';
import { ProjectsService } from './projects.service';
import { SessionGuard } from '../../../core/auth/session.guard';
import { PermissionGuard } from '../../../core/rbac/rbac.guard';
import { RequirePermission } from '../../../core/rbac/require-permission.decorator';
import { AppException } from '../../../core/errors/app-exception';

class CreateProjectBody {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) color?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(10) @Matches(/^[A-Za-z0-9]+$/) key?: string;
}

class UpdateProjectBody {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) color?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(10) @Matches(/^[A-Za-z0-9]+$/) key?: string;
}

@ApiTags('boards')
@ApiBearerAuth('session')
@Controller('boards/projects')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('boards', 'manage')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  findAll() {
    return this.projects.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projects.findById(id);
  }

  @Post()
  create(@Body() dto: CreateProjectBody, @Req() req: { session: { userId?: string } }) {
    const userId = req.session.userId;
    if (!userId) throw AppException.sessionExpired();
    return this.projects.create(dto, userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectBody) {
    return this.projects.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.projects.delete(id);
  }
}
