import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../core/auth/session.guard';
import { PermissionGuard } from '../../core/rbac/rbac.guard';
import { RequirePermission } from '../../core/rbac/require-permission.decorator';
import { Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AgentConversationsService } from './agent-conversations.service';

@Controller('agent/conversations')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('agent', 'use')
export class AgentConversationsController {
  constructor(private conversations: AgentConversationsService) {}

  @Get()
  list(@Req() req: FastifyRequest) {
    const userId = (req.session as { userId?: string }).userId!;
    return this.conversations.listForUser(userId);
  }

  @Get(':id')
  get(@Req() req: FastifyRequest, @Param('id') id: string) {
    const userId = (req.session as { userId?: string }).userId!;
    return this.conversations.getForUser(userId, id);
  }

  @Delete(':id')
  async remove(@Req() req: FastifyRequest, @Param('id') id: string) {
    const userId = (req.session as { userId?: string }).userId!;
    await this.conversations.deleteForUser(userId, id);
    return { success: true };
  }
}
