import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { SessionGuard } from '../../core/auth/session.guard';
import { PermissionGuard } from '../../core/rbac/rbac.guard';
import { RequirePermission } from '../../core/rbac/require-permission.decorator';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { CreateLeadCommentDto } from './dto/create-lead-comment.dto';
import { AppException } from '../../core/errors/app-exception';

@ApiTags('leads')
@Controller('leads')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('leads', 'manage')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get('board')
  getBoard(@Query('ownerId') ownerId?: string) {
    return this.leads.getBoard(ownerId || undefined);
  }

  @Get('assignees')
  getAssignees() {
    return this.leads.getAssignees();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const lead = await this.leads.findById(id);
    if (!lead) throw AppException.notFound('lead', id);
    return lead;
  }

  @Post()
  create(@Body() dto: CreateLeadDto) {
    return this.leads.createManual(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leads.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.leads.delete(id);
  }

  @Post(':id/comments')
  addComment(
    @Param('id') id: string,
    @Body() dto: CreateLeadCommentDto,
    @Req() req: FastifyRequest,
  ) {
    const userId = req.session.userId;
    if (!userId) throw AppException.sessionExpired();
    return this.leads.addComment(id, userId, dto.body);
  }
}
