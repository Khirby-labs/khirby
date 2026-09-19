import { Controller, Get, Post, Param, Query, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { SessionGuard } from '../../core/auth/session.guard';
import { PermissionGuard } from '../../core/rbac/rbac.guard';
import { RequirePermission } from '../../core/rbac/require-permission.decorator';
import { AppException } from '../../core/errors/app-exception';
import { InquiryService } from './inquiry.service';
import { ListInquiriesQueryDto } from './dto/list-inquiries-query.dto';
import { AcceptInquiryDto } from './dto/accept-inquiry.dto';

@ApiTags('inquiries')
@Controller('inquiries')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('inquiries', 'manage')
export class InquiryController {
  constructor(private readonly inquiryService: InquiryService) {}

  @Get()
  findAll(@Query() query: ListInquiriesQueryDto) {
    return this.inquiryService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const inquiry = await this.inquiryService.findById(id);
    if (!inquiry) throw AppException.notFound('inquiry', id);
    return inquiry;
  }

  @Post(':id/accept')
  accept(@Param('id') id: string, @Body() dto: AcceptInquiryDto, @Req() req: FastifyRequest) {
    const userId = req.session.userId;
    if (!userId) throw AppException.sessionExpired();
    return this.inquiryService.accept(id, userId, { stageId: dto.stageId });
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Req() req: FastifyRequest) {
    const userId = req.session.userId;
    if (!userId) throw AppException.sessionExpired();
    return this.inquiryService.reject(id, userId);
  }

  @Post(':id/spam')
  spam(@Param('id') id: string, @Req() req: FastifyRequest) {
    const userId = req.session.userId;
    if (!userId) throw AppException.sessionExpired();
    return this.inquiryService.spam(id, userId);
  }
}
