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
  IsArray,
  MinLength,
  MaxLength,
  IsUUID,
  IsInt,
} from 'class-validator';
import { ModulesService } from './modules.service';
import { SessionGuard } from '../../../core/auth/session.guard';
import { PermissionGuard } from '../../../core/rbac/rbac.guard';
import { RequirePermission } from '../../../core/rbac/require-permission.decorator';

class CreateModuleBody {
  @IsUUID() projectId!: string;
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() position?: number;
}

class UpdateModuleBody {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsString() description?: string | null;
}

class ReorderBody {
  @IsUUID() projectId!: string;
  @IsArray() @IsUUID('4', { each: true }) ids!: string[];
}

@ApiTags('boards')
@ApiBearerAuth('session')
@Controller('boards/modules')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('boards', 'manage')
export class ModulesController {
  constructor(private readonly modules: ModulesService) {}

  @Get()
  findByProject(@Query('projectId') projectId: string) {
    return this.modules.findByProject(projectId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.modules.findById(id);
  }

  @Post()
  create(@Body() dto: CreateModuleBody) {
    return this.modules.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateModuleBody) {
    return this.modules.update(id, dto);
  }

  @Post('reorder')
  reorder(@Body() body: ReorderBody) {
    return this.modules.reorder(body.projectId, body.ids);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.modules.delete(id);
  }
}
