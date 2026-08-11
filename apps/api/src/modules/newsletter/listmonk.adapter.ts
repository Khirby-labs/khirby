import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import { submissions } from '../../core/database/schema';

@Injectable()
export class ListmonkAdapter {
  private readonly logger = new Logger(ListmonkAdapter.name);
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(
    private config: ConfigService,
    @Inject(DB_TOKEN) private db: Db,
  ) {
    const url = this.config.get<string>('LISTMONK_URL', '');
    const user = this.config.get<string>('LISTMONK_USER', '');
    const pass = this.config.get<string>('LISTMONK_PASSWORD', '');

    this.baseUrl = url.replace(/\/$/, '');
    this.authHeader = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  }

  async addSubscriber(email: string, name: string, listIds: number[]): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/subscribers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.authHeader,
        },
        body: JSON.stringify({
          email,
          name,
          status: 'enabled',
          lists: listIds,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        this.logger.warn(
          `listmonk addSubscriber failed [${response.status}]: ${text}`,
        );
      }
    } catch (err) {
      this.logger.warn(`listmonk addSubscriber error: ${(err as Error).message}`);
    }
  }

  async syncSubmission(
    submissionId: string,
    contactEmail: string,
    contactName: string,
    listIds: number[],
  ): Promise<void> {
    await this.addSubscriber(contactEmail, contactName, listIds);

    await this.db
      .update(submissions)
      .set({ listmonkSynced: true } as any)
      .where(eq(submissions.id, submissionId));
  }
}
