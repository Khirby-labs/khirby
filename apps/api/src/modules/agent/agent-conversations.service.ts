import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import { agentConversations, agentMessages } from '../../core/database/schema';
import { AppException } from '../../core/errors/app-exception';

const TITLE_MAX = 80;

function truncateTitle(content: string): string {
  const oneLine = content.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= TITLE_MAX) return oneLine;
  return `${oneLine.slice(0, TITLE_MAX - 1)}…`;
}

@Injectable()
export class AgentConversationsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async listForUser(userId: string) {
    return this.db
      .select({
        id: agentConversations.id,
        title: agentConversations.title,
        createdAt: agentConversations.createdAt,
        updatedAt: agentConversations.updatedAt,
      })
      .from(agentConversations)
      .where(eq(agentConversations.userId, userId))
      .orderBy(desc(agentConversations.updatedAt));
  }

  async getForUser(userId: string, conversationId: string) {
    const [conversation] = await this.db
      .select()
      .from(agentConversations)
      .where(and(eq(agentConversations.id, conversationId), eq(agentConversations.userId, userId)))
      .limit(1);
    if (!conversation) throw AppException.notFound('conversation', conversationId);

    const messages = await this.db
      .select()
      .from(agentMessages)
      .where(eq(agentMessages.conversationId, conversationId))
      .orderBy(agentMessages.createdAt);

    return { ...conversation, messages };
  }

  async deleteForUser(userId: string, conversationId: string) {
    const [row] = await this.db
      .select({ id: agentConversations.id })
      .from(agentConversations)
      .where(and(eq(agentConversations.id, conversationId), eq(agentConversations.userId, userId)))
      .limit(1);
    if (!row) throw AppException.notFound('conversation', conversationId);
    await this.db.delete(agentConversations).where(eq(agentConversations.id, conversationId));
  }

  async createConversation(userId: string, content: string) {
    const [conversation] = await this.db
      .insert(agentConversations)
      .values({
        userId,
        title: truncateTitle(content),
      } as any)
      .returning();
    return conversation;
  }

  async touchConversation(conversationId: string) {
    await this.db
      .update(agentConversations)
      .set({ updatedAt: new Date() } as any)
      .where(eq(agentConversations.id, conversationId));
  }

  async insertUserMessage(conversationId: string, content: string) {
    const [message] = await this.db
      .insert(agentMessages)
      .values({ conversationId, role: 'user', content } as any)
      .returning();
    return message;
  }

  async insertAssistantMessage(
    conversationId: string,
    content: string,
    toolTrace: typeof agentMessages.$inferSelect.toolTrace,
  ) {
    const [message] = await this.db
      .insert(agentMessages)
      .values({ conversationId, role: 'assistant', content, toolTrace } as any)
      .returning();
    return message;
  }

  async loadHistory(conversationId: string) {
    const rows = await this.db
      .select({ role: agentMessages.role, content: agentMessages.content })
      .from(agentMessages)
      .where(eq(agentMessages.conversationId, conversationId))
      .orderBy(agentMessages.createdAt);
    return rows.map((r) => ({ role: r.role, content: r.content }));
  }

  async assertOwned(userId: string, conversationId: string) {
    const [row] = await this.db
      .select({ id: agentConversations.id })
      .from(agentConversations)
      .where(and(eq(agentConversations.id, conversationId), eq(agentConversations.userId, userId)))
      .limit(1);
    if (!row) throw AppException.notFound('conversation', conversationId);
    return row;
  }
}

export { truncateTitle };
