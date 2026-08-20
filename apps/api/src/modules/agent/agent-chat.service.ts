import { ConflictException, Injectable, Inject, Logger, Optional } from '@nestjs/common';
import {
  AI_COMPOSE_LLM,
  type AiComposeLlmLike,
} from '../../../../../packages/plugin-host/src/tokens';
import { AgentConversationsService } from './agent-conversations.service';
import { AgentChatDto } from './dto/agent-chat.dto';
import {
  AgentLlmClient,
  type AgentSseEvent,
  type LlmMessage,
  type StreamChunk,
} from './agent-llm.client';
import { CrmToolsAdapter } from './tools/crm-tools.adapter';
import { MailToolsAdapter } from './tools/mail-tools.adapter';
import { PluginToolsAdapter, PokeloToolsAdapter } from './tools/plugin-tools.adapter';
import { buildAgentSystemPrompt } from './agent-system-prompt';
import {
  pendingPluginDirectories,
  pluginAwareFallbackSummary,
  trackPluginDirectory,
} from './plugin-agent-tracker';

export const MAX_ITERATIONS = 8;
const TOOL_TIMEOUT_MS = 10_000;

export type AgentLoopOpts = {
  signal?: AbortSignal;
  write: (event: AgentSseEvent) => void;
};

@Injectable()
export class AgentChatService {
  private readonly logger = new Logger(AgentChatService.name);
  private readonly llm = new AgentLlmClient();
  private activeStreams = new Set<string>();

  constructor(
    private conversations: AgentConversationsService,
    private crmTools: CrmToolsAdapter,
    private mailTools: MailToolsAdapter,
    private pluginTools: PluginToolsAdapter,
    private pokeloTools: PokeloToolsAdapter,
    @Optional() @Inject(AI_COMPOSE_LLM) private llmProvider: AiComposeLlmLike | null,
  ) {}

  async runAgentLoop(userId: string, dto: AgentChatDto, opts: AgentLoopOpts): Promise<void> {
    let conversationId = dto.conversationId;

    if (conversationId) {
      if (this.activeStreams.has(conversationId)) {
        throw new ConflictException({
          code: 'stream_in_progress',
          message: 'A stream is already in progress for this conversation',
        });
      }
      await this.conversations.assertOwned(userId, conversationId);
    } else {
      const created = await this.conversations.createConversation(userId, dto.content);
      conversationId = created.id;
      opts.write({ type: 'conversation', conversationId });
    }

    this.activeStreams.add(conversationId);
    try {
      await this.conversations.insertUserMessage(conversationId, dto.content);
      await this.conversations.touchConversation(conversationId);

      const config = this.llmProvider ? await this.llmProvider.getCompletionConfig() : null;
      if (!config?.apiKey || !config.baseUrl || !config.model) {
        opts.write({ type: 'error', code: 'ai_compose_unavailable' });
        return;
      }

      const history = await this.conversations.loadHistory(conversationId);
      const pluginToolDefs = this.pluginTools.definitions();
      const pokeloToolDefs = this.pokeloTools.definitions();
      const tools = [
        ...this.crmTools.definitions(),
        ...this.mailTools.definitions(),
        ...pluginToolDefs,
        ...pokeloToolDefs,
      ];

      const messages: LlmMessage[] = [
        {
          role: 'system',
          content: buildAgentSystemPrompt({
            hasPokelo: pokeloToolDefs.length > 0,
            hasPluginTools: pluginToolDefs.length > 0,
          }),
        },
        ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ];

      const toolTrace: Array<{
        id: string;
        name: string;
        args: Record<string, unknown>;
        ok: boolean;
        summary: string;
      }> = [];
      const pendingPluginDirs = new Set<string>();
      const installedPluginDirs = new Set<string>();

      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        if (opts.signal?.aborted) return;

        opts.write({ type: 'status', code: iteration === 0 ? 'thinking' : 'writing' });

        const { text: iterationText, toolCalls } = await this.collectCompletion(
          config,
          messages,
          tools,
          opts,
          (delta) => opts.write({ type: 'text_delta', delta }),
        );

        if (!toolCalls.length) {
          await this.flushPendingPluginInstalls(
            userId,
            pendingPluginDirs,
            installedPluginDirs,
            toolTrace,
            opts,
          );
          let reply = iterationText;
          if (!reply.trim() && toolTrace.length) {
            reply =
              pluginAwareFallbackSummary(toolTrace) ?? buildToolFallbackSummaryFromTrace(toolTrace);
            opts.write({ type: 'text_delta', delta: reply });
          }
          await this.persistAssistant(conversationId, reply, toolTrace);
          opts.write({ type: 'done' });
          return;
        }

        messages.push({
          role: 'assistant',
          content: iterationText || undefined,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        });

        for (const tc of toolCalls) {
          if (opts.signal?.aborted) return;
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.arguments || '{}');
          } catch {
            args = {};
          }

          opts.write({ type: 'tool_call', id: tc.id, name: tc.name, args });
          opts.write({ type: 'status', code: `running_${tc.name}` });

          const result = await this.runToolWithTimeout(userId, tc.name, args, opts.signal);
          opts.write({
            type: 'tool_result',
            id: tc.id,
            ok: result.ok,
            summary: result.summary,
            code: result.ok ? undefined : (result as any).code,
          });

          toolTrace.push({
            id: tc.id,
            name: tc.name,
            args,
            ok: result.ok,
            summary: result.summary,
          });
          trackPluginDirectory(pendingPluginDirs, installedPluginDirs, tc.name, args, result);

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.name,
            content: result.summary,
          });
        }
      }

      await this.flushPendingPluginInstalls(
        userId,
        pendingPluginDirs,
        installedPluginDirs,
        toolTrace,
        opts,
      );
      const finalText = await this.synthesizeFinalAnswer(config, messages, opts, toolTrace);
      await this.persistAssistant(conversationId, finalText, toolTrace);
      opts.write({ type: 'done' });
    } finally {
      this.activeStreams.delete(conversationId);
    }
  }

  private async collectCompletion(
    config: { baseUrl: string; apiKey: string; model: string },
    messages: LlmMessage[],
    tools: ReturnType<CrmToolsAdapter['definitions']>,
    opts: AgentLoopOpts,
    onTextDelta: (delta: string) => void,
  ) {
    const chunks: StreamChunk[] = [];
    for await (const chunk of this.llm.streamCompletion({
      ...config,
      messages,
      tools,
      signal: opts.signal,
    })) {
      if (opts.signal?.aborted) break;
      chunks.push(chunk);
      if (chunk.kind === 'text') onTextDelta(chunk.delta);
    }
    return this.llm.collectFromChunks(chunks);
  }

  /** One text-only pass when the model stopped after tools without a user summary. */
  private async synthesizeFinalAnswer(
    config: { baseUrl: string; apiKey: string; model: string },
    messages: LlmMessage[],
    opts: AgentLoopOpts,
    toolTrace: Array<{ name: string; args: Record<string, unknown>; ok: boolean; summary: string }>,
  ): Promise<string> {
    opts.write({ type: 'status', code: 'writing' });
    const synthesisMessages: LlmMessage[] = [
      ...messages,
      {
        role: 'user',
        content:
          'Write your final reply to the user now. Summarize what you found or did and any next steps. Use the same language as the conversation. Markdown — do not call tools.',
      },
    ];
    let text = '';
    const collected = await this.collectCompletion(
      config,
      synthesisMessages,
      undefined,
      opts,
      (delta) => {
        text += delta;
        opts.write({ type: 'text_delta', delta });
      },
    );
    const reply =
      collected.text.trim() ||
      text.trim() ||
      pluginAwareFallbackSummary(toolTrace) ||
      buildToolFallbackSummary(messages);
    if (!collected.text.trim() && !text.trim() && reply) {
      opts.write({ type: 'text_delta', delta: reply });
    }
    return reply;
  }

  private async persistAssistant(
    conversationId: string,
    content: string,
    toolTrace: Array<{
      id: string;
      name: string;
      args: Record<string, unknown>;
      ok: boolean;
      summary: string;
    }>,
  ) {
    const body =
      content.trim() || (toolTrace.length ? buildToolFallbackSummaryFromTrace(toolTrace) : '');
    if (!body) return;
    await this.conversations.insertAssistantMessage(
      conversationId,
      body,
      toolTrace.length ? toolTrace : null,
    );
    await this.conversations.touchConversation(conversationId);
  }

  private async runToolWithTimeout(
    userId: string,
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    if (signal?.aborted) return { ok: false as const, code: 'aborted', summary: 'Aborted' };

    const runner = this.resolveToolRunner(name);
    return Promise.race([
      runner(userId, name, args),
      new Promise<{ ok: false; code: string; summary: string }>((resolve) =>
        setTimeout(
          () => resolve({ ok: false, code: 'timeout', summary: 'Tool timed out' }),
          TOOL_TIMEOUT_MS,
        ),
      ),
    ]);
  }

  private resolveToolRunner(name: string) {
    const mailNames = new Set(this.mailTools.definitions().map((d) => d.function.name));
    const pluginNames = new Set(this.pluginTools.definitions().map((d) => d.function.name));
    const pokeloNames = new Set(this.pokeloTools.definitions().map((d) => d.function.name));
    if (mailNames.has(name))
      return (uid: string, n: string, a: Record<string, unknown>) => this.mailTools.run(uid, n, a);
    if (pluginNames.has(name))
      return (uid: string, n: string, a: Record<string, unknown>) =>
        this.pluginTools.run(uid, n, a);
    if (pokeloNames.has(name))
      return (uid: string, n: string, a: Record<string, unknown>) =>
        this.pokeloTools.run(uid, n, a);
    return (uid: string, n: string, a: Record<string, unknown>) => this.crmTools.run(uid, n, a);
  }

  /**
   * If the model scaffolded or edited a volume plugin but never installed it,
   * finish the job before we tell the user it worked.
   */
  private async flushPendingPluginInstalls(
    userId: string,
    pending: Set<string>,
    installed: Set<string>,
    toolTrace: Array<{
      id: string;
      name: string;
      args: Record<string, unknown>;
      ok: boolean;
      summary: string;
    }>,
    opts: AgentLoopOpts,
  ): Promise<void> {
    for (const directory of pendingPluginDirectories(pending, installed)) {
      if (opts.signal?.aborted) return;
      const id = `auto-install-${directory}`;
      const args = { directory };
      opts.write({ type: 'tool_call', id, name: 'install_instance_plugin', args });
      opts.write({ type: 'status', code: 'running_install_instance_plugin' });
      const result = await this.runToolWithTimeout(
        userId,
        'install_instance_plugin',
        args,
        opts.signal,
      );
      opts.write({
        type: 'tool_result',
        id,
        ok: result.ok,
        summary: result.summary,
        code: result.ok ? undefined : (result as { code?: string }).code,
      });
      toolTrace.push({
        id,
        name: 'install_instance_plugin',
        args,
        ok: result.ok,
        summary: result.summary,
      });
      trackPluginDirectory(pending, installed, 'install_instance_plugin', args, result);
    }
  }
}

function buildToolFallbackSummaryFromTrace(
  toolTrace: Array<{ ok: boolean; summary: string; name: string }>,
): string {
  const pluginSummary = pluginAwareFallbackSummary(toolTrace);
  if (pluginSummary) return pluginSummary;

  const failed = toolTrace.filter((t) => !t.ok);
  if (failed.length === toolTrace.length) {
    return (
      failed
        .map((t) => t.summary)
        .filter(Boolean)
        .join('\n\n') || 'Operacja nie powiodła się.'
    );
  }
  const lastOk = [...toolTrace].reverse().find((t) => t.ok);
  return lastOk?.summary ?? 'Gotowe.';
}

function buildToolFallbackSummary(messages: LlmMessage[]): string {
  const toolLines = messages
    .filter((m) => m.role === 'tool' && m.content?.trim())
    .map((m) => m.content!.trim());
  return toolLines.at(-1) ?? 'Gotowe.';
}
