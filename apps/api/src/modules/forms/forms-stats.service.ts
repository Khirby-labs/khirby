import { Injectable, Inject } from '@nestjs/common';
import { eq, and, sql, gte, lte } from 'drizzle-orm';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import { forms, submissions } from '../../core/database/schema';
import { FormStatsQueryDto } from './dto/form-stats-query.dto';
import { AppException } from '../../core/errors/app-exception';

function parseDateBound(value: string | undefined, label: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw AppException.badRequest(`Invalid ${label} date`, { field: label });
  }
  return d;
}

@Injectable()
export class FormsStatsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  async getStats(query: FormStatsQueryDto) {
    const from = parseDateBound(query.from, 'from');
    const to = parseDateBound(query.to, 'to');

    const submissionFilters = [];
    if (query.formId) {
      submissionFilters.push(eq(submissions.formId, query.formId));
    }
    if (from) {
      submissionFilters.push(gte(submissions.createdAt, from));
    }
    if (to) {
      submissionFilters.push(lte(submissions.createdAt, to));
    }

    const whereClause = submissionFilters.length ? and(...submissionFilters) : undefined;

    const totalQuery = this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(submissions);
    const [{ count: total }] = whereClause
      ? await totalQuery.where(whereClause)
      : await totalQuery;

    const [{ count: activeForms }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(forms)
      .where(eq(forms.active, true));

    const joinFilters = [eq(submissions.formId, forms.id)];
    if (from) joinFilters.push(gte(submissions.createdAt, from));
    if (to) joinFilters.push(lte(submissions.createdAt, to));

    const joinCondition = joinFilters.length === 1
      ? joinFilters[0]
      : and(...joinFilters);

    let byFormQuery = this.db
      .select({
        formId: forms.id,
        formName: forms.name,
        count: sql<number>`count(${submissions.id})::int`,
      })
      .from(forms)
      .leftJoin(submissions, joinCondition)
      .groupBy(forms.id, forms.name)
      .orderBy(sql`count(${submissions.id}) desc`);

    if (query.formId) {
      byFormQuery = byFormQuery.where(eq(forms.id, query.formId)) as typeof byFormQuery;
    }

    const byForm = await byFormQuery;

    let byDay: Array<{ day: string; count: number }> | undefined;
    if (query.daily) {
      const dayQuery = this.db
        .select({
          day: sql<string>`to_char(${submissions.createdAt}, 'YYYY-MM-DD')`,
          count: sql<number>`count(*)::int`,
        })
        .from(submissions)
        .groupBy(sql`to_char(${submissions.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${submissions.createdAt}, 'YYYY-MM-DD')`);

      const dayRows = whereClause
        ? await dayQuery.where(whereClause)
        : await dayQuery;

      byDay = dayRows.map((r) => ({ day: r.day, count: r.count }));
    }

    return {
      total,
      activeForms,
      byForm: byForm.map((r) => ({
        formId: r.formId,
        formName: r.formName,
        count: r.count,
      })),
      byDay,
    };
  }
}
