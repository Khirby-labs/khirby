import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { SessionGuard } from '../../core/auth/session.guard';
import { PermissionGuard } from '../../core/rbac/rbac.guard';
import { RequirePermission } from '../../core/rbac/require-permission.decorator';
import { AgentChatService } from './agent-chat.service';
import { AgentChatDto } from './dto/agent-chat.dto';
import type { AgentSseEvent } from './agent-llm.client';

@Controller('agent')
@UseGuards(SessionGuard, PermissionGuard)
@RequirePermission('agent', 'use')
export class AgentChatController {
  private readonly logger = new Logger(AgentChatController.name);

  constructor(private chatService: AgentChatService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(
    @Body() dto: AgentChatDto,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const userId = (req.session as { userId?: string }).userId!;
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const ac = new AbortController();
    const onClose = () => {
      if (!reply.raw.writableEnded) ac.abort();
    };
    reply.raw.on('close', onClose);

    const write = (event: AgentSseEvent) => {
      if (ac.signal.aborted) return;
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      await this.chatService.runAgentLoop(userId, dto, { signal: ac.signal, write });
    } catch (e: unknown) {
      if (ac.signal.aborted) return;
      const err = e as { status?: number; response?: { code?: string; message?: string } };
      if (err?.status === 409) {
        write({ type: 'error', code: 'stream_in_progress' });
      } else {
        this.logger.warn(e instanceof Error ? e.message : 'agent chat failed');
        write({ type: 'error', code: 'internal' });
      }
    } finally {
      reply.raw.off('close', onClose);
      if (!reply.raw.writableEnded) reply.raw.end();
    }
  }
}
