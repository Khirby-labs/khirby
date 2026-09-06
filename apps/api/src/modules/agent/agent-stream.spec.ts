import { request } from 'node:http';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { AgentChatController } from './agent-chat.controller';
import { AgentChatService } from './agent-chat.service';

/** Exercise Nest guards/body parsing as well as the actual HTTP response lifecycle. */
describe('agent SSE connection lifecycle', () => {
  it.each([
    { delay: 0, disconnect: false },
    { delay: 10, disconnect: false },
    { delay: 0, disconnect: true },
  ])(
    'streams normally or cancels only on response disconnect: %j',
    async ({ delay, disconnect }) => {
      let effects = 0;
      let signal!: AbortSignal;
      let finished!: () => void;
      const completed = new Promise<void>((resolve) => {
        finished = resolve;
      });
      const module = await Test.createTestingModule({
        controllers: [AgentChatController],
        providers: [
          {
            provide: 'CRM_RBAC_SERVICE',
            useValue: {
              hasPermission: async () => {
                if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
                return true;
              },
            },
          },
          {
            provide: AgentChatService,
            useValue: {
              runAgentLoop: async (_user: string, _dto: unknown, opts: any) => {
                signal = opts.signal;
                opts.write({ type: 'status', code: 'thinking' });
                await new Promise((resolve) => setTimeout(resolve, 60));
                if (!signal.aborted) effects++;
                opts.write({ type: 'text_delta', delta: 'fixture' });
                finished();
              },
            },
          },
        ],
      }).compile();
      const app = module.createNestApplication(new FastifyAdapter(), { logger: false });
      app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
      app
        .getHttpAdapter()
        .getInstance()
        .addHook('onRequest', async (req: any) => {
          req.session = { userId: 'user' };
        });
      try {
        await app.listen(0, '127.0.0.1');
        const body = await new Promise<string>((resolve, reject) => {
          const outgoing = request(
            {
              hostname: '127.0.0.1',
              port: app.getHttpServer().address().port,
              path: '/agent/chat',
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            },
            (response) => {
              let text = '';
              response.on('data', (chunk) => {
                text += chunk;
                if (disconnect) {
                  outgoing.destroy();
                  resolve(text);
                }
              });
              response.on('end', () => resolve(text));
            },
          );
          outgoing.on('error', reject);
          outgoing.end(JSON.stringify({ content: 'fixture' }));
        });
        await completed;
        expect(signal.aborted).toBe(disconnect);
        expect(effects).toBe(disconnect ? 0 : 1);
        if (!disconnect) expect(body).toContain('fixture');
      } finally {
        await app.close();
      }
    },
  );
});
