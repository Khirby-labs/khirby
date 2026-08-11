import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';
import { TagsService } from './tags.service';
import { SessionGuard } from '../../../core/auth/session.guard';
import { PermissionGuard } from '../../../core/rbac/rbac.guard';
import { RequirePermission } from '../../../core/rbac/require-permission.decorator';

class CreateTagBody {
  @IsString() @MinLength(1) @MaxLength(50) name!: string;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) color?: string;
}

@ApiTags('boards')
@ApiBearerAuth('session')
@Controller('boards/tags')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('boards', 'manage')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  findAll() {
    return this.tags.findAll();
  }

  @Post()
  create(@Body() dto: CreateTagBody) {
    return this.tags.create(dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.tags.delete(id);
  }
}
