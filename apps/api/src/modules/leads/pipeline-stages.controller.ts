import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SessionGuard } from '../../core/auth/session.guard';
import { PermissionGuard } from '../../core/rbac/rbac.guard';
import { RequirePermission } from '../../core/rbac/require-permission.decorator';
import { PipelineStagesService } from './pipeline-stages.service';
import { CreatePipelineStageDto } from './dto/create-pipeline-stage.dto';
import { UpdatePipelineStageDto } from './dto/update-pipeline-stage.dto';
import { ReorderPipelineStagesDto } from './dto/reorder-pipeline-stages.dto';
import { AppException } from '../../core/errors/app-exception';

@ApiTags('pipeline')
@Controller('pipeline/stages')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('leads', 'manage')
export class PipelineStagesController {
  constructor(private readonly stages: PipelineStagesService) {}

  @Get()
  async findAll() {
    await this.stages.ensureDefaults();
    return this.stages.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const stage = await this.stages.findById(id);
    if (!stage) throw AppException.notFound('pipelineStage', id);
    return stage;
  }

  @Post()
  create(@Body() dto: CreatePipelineStageDto) {
    return this.stages.create(dto);
  }

  @Patch('reorder')
  reorder(@Body() dto: ReorderPipelineStagesDto) {
    return this.stages.reorder(dto.stageIds);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePipelineStageDto) {
    return this.stages.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') id: string) {
    return this.stages.delete(id);
  }
}
