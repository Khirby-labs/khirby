import { Injectable, Inject } from '@nestjs/common';
import { eq, and, sql, gte, lte } from 'drizzle-orm';
import { Db } from '../../core/database/db';
import { DB_TOKEN } from '../../core/database/database.module';
import { forms, submissions, inquiries } from '../../core/database/schema';
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

    const inquiryFilters = [];
    if (query.formId) {
      inquiryFilters.push(eq(inquiries.formId, query.formId));
    }
    if (from) {
      inquiryFilters.push(gte(inquiries.createdAt, from));
    }
    if (to) {
      inquiryFilters.push(lte(inquiries.createdAt, to));
    }

    const submissionWhere = submissionFilters.length ? and(...submissionFilters) : undefined;
    const inquiryWhere = inquiryFilters.length ? and(...inquiryFilters) : undefined;

    const submissionTotalQuery = this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(submissions);
    const [{ count: submissionTotal }] = submissionWhere
      ? await submissionTotalQuery.where(submissionWhere)
      : await submissionTotalQuery;

    const inquiryTotalQuery = this.db.select({ count: sql<number>`count(*)::int` }).from(inquiries);
    const [{ count: inquiryTotal }] = inquiryWhere
      ? await inquiryTotalQuery.where(inquiryWhere)
      : await inquiryTotalQuery;

    const total = submissionTotal + inquiryTotal;

    const [{ count: activeForms }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(forms)
      .where(eq(forms.active, true));

    // Per-form: lead → submissions; inquiry → inquiries (ADR-0053).
    const fromSql = from ? sql` and created_at >= ${from}` : sql``;
    const toSql = to ? sql` and created_at <= ${to}` : sql``;

    let byFormQuery = this.db
      .select({
        formId: forms.id,
        formName: forms.name,
        count: sql<number>`(
          case
            when ${forms.destination} = 'inquiry' then (
              select count(*)::int from ${inquiries}
              where ${inquiries.formId} = ${forms.id}${fromSql}${toSql}
            )
            else (
              select count(*)::int from ${submissions}
              where ${submissions.formId} = ${forms.id}${fromSql}${toSql}
            )
          end
        )`,
      })
      .from(forms)
      .orderBy(sql`4 desc`);

    if (query.formId) {
      byFormQuery = byFormQuery.where(eq(forms.id, query.formId)) as typeof byFormQuery;
    }

    const byForm = await byFormQuery;

    let byDay: Array<{ day: string; count: number }> | undefined;
    if (query.daily) {
      const submissionDayQuery = this.db
        .select({
          day: sql<string>`to_char(${submissions.createdAt}, 'YYYY-MM-DD')`,
          count: sql<number>`count(*)::int`,
        })
        .from(submissions)
        .groupBy(sql`to_char(${submissions.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${submissions.createdAt}, 'YYYY-MM-DD')`);

      const inquiryDayQuery = this.db
        .select({
          day: sql<string>`to_char(${inquiries.createdAt}, 'YYYY-MM-DD')`,
          count: sql<number>`count(*)::int`,
        })
        .from(inquiries)
        .groupBy(sql`to_char(${inquiries.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${inquiries.createdAt}, 'YYYY-MM-DD')`);

      const submissionDays = submissionWhere
        ? await submissionDayQuery.where(submissionWhere)
        : await submissionDayQuery;
      const inquiryDays = inquiryWhere
        ? await inquiryDayQuery.where(inquiryWhere)
        : await inquiryDayQuery;

      const merged = new Map<string, number>();
      for (const row of submissionDays) {
        merged.set(row.day, (merged.get(row.day) ?? 0) + row.count);
      }
      for (const row of inquiryDays) {
        merged.set(row.day, (merged.get(row.day) ?? 0) + row.count);
      }
      byDay = [...merged.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, count]) => ({ day, count }));
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
