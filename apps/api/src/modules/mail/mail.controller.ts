import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { SessionGuard } from '../../core/auth/session.guard';
import { PermissionGuard } from '../../core/rbac/rbac.guard';
import {
  RequireAnyPermission,
  RequirePermission,
} from '../../core/rbac/require-permission.decorator';
import { MailThreadService } from './mail-thread.service';
import { MailSendService } from './mail-send.service';
import { ListThreadsQueryDto, CreateThreadDto, ReplyThreadDto } from './dto/thread.dto';
import { CaptureAsLeadDto } from './dto/capture-as-lead.dto';
import { AppException } from '../../core/errors/app-exception';

@ApiTags('mail')
@Controller('mail/threads')
@UseGuards(SessionGuard, PermissionGuard)
@RequireAnyPermission(['leads', 'manage'], ['contacts', 'manage'])
export class MailController {
  constructor(
    private readonly threads: MailThreadService,
    private readonly send: MailSendService,
  ) {}

  @Get()
  list(@Query() query: ListThreadsQueryDto) {
    return this.threads.listThreads({
      contactId: query.contactId,
      leadId: query.leadId,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    });
  }

  @Get(':id')
  getThread(@Param('id') id: string) {
    return this.threads.getThread(id);
  }

  @Post()
  createThread(@Body() dto: CreateThreadDto, @Req() req: FastifyRequest) {
    const userId = req.session.userId;
    if (!userId) throw AppException.sessionExpired();
    return this.send.createThread({
      contactId: dto.contactId,
      leadId: dto.leadId,
      toAddress: dto.toAddress,
      subject: dto.subject,
      bodyText: dto.bodyText,
      sentByUserId: userId,
    });
  }

  @Post(':id/reply')
  reply(@Param('id') id: string, @Body() dto: ReplyThreadDto, @Req() req: FastifyRequest) {
    const userId = req.session.userId;
    if (!userId) throw AppException.sessionExpired();
    return this.send.reply({
      threadId: id,
      bodyText: dto.bodyText,
      sentByUserId: userId,
    });
  }

  @Post(':id/capture-as-lead')
  @RequirePermission('leads', 'manage')
  captureAsLead(@Param('id') id: string, @Body() dto: CaptureAsLeadDto) {
    return this.threads.captureAsLead(id, dto);
  }

  @Delete(':id')
  deleteThread(@Param('id') id: string) {
    return this.threads.deleteThread(id);
  }
}
