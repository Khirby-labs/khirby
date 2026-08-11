import { Injectable, Inject, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { Db } from '../database/db';
import { DB_TOKEN } from '../database/database.module';
import { users } from '../database/schema';
import { AppException } from '../errors/app-exception';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async validateUser(email: string, password: string) {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      const emailHash = createHash('sha256').update(email).digest('hex').slice(0, 8);
      this.logger.warn(`Login failed for [${emailHash}]`);
      throw AppException.invalidCredentials();
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const emailHash = createHash('sha256').update(email).digest('hex').slice(0, 8);
      this.logger.warn(`Login failed for [${emailHash}]`);
      throw AppException.invalidCredentials();
    }
    return { id: user.id, email: user.email, locale: user.locale };
  }

  async createUser(email: string, password: string) {
    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await this.db
      .insert(users)
      .values({ email, passwordHash } as any)
      .returning();
    return user;
  }

  async findById(id: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return user ?? null;
  }

  /**
   * Stores the account's interface language, or clears it back to "follow the
   * browser" when `locale` is null. The value is validated by the DTO against
   * SUPPORTED_LOCALE_CODES — this layer never invents a default (ADR-0011).
   */
  async updateLocale(userId: string, locale: string | null) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw AppException.sessionExpired();
    await this.db
      .update(users)
      .set({ locale } as any)
      .where(eq(users.id, userId));
    return { locale };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw AppException.sessionExpired();
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw AppException.currentPasswordInvalid();
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.db
      .update(users)
      .set({ passwordHash } as any)
      .where(eq(users.id, userId));
    return { success: true };
  }
}
