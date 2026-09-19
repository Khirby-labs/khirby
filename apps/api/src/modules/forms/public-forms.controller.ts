import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  NotFoundException,
  BadRequestException,
  Logger,
  Req,
  Header,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FastifyRequest } from 'fastify';
import { FormsService } from './forms.service';
import { assertEmailPresent } from './validate-submission-data';
import { ContactsService } from '../contacts/contacts.service';
import { LeadsService } from '../leads/leads.service';
import { EventsService } from '../../core/events/events.service';
import { SubmissionSource } from '../../core/database/schema';
import { AppException } from '../../core/errors/app-exception';
import { InquiryService } from '../inquiry/inquiry.service';
import { PluginRegistryService } from '../plugins/plugin-registry.service';
import { assertPublicAdaptiveOpening } from '../inquiry/adaptive-intake-guards';
// Relative import: nest build is plain tsc; bare '@khirby/types' would survive into dist.
import { isLocaleCode, type LocaleCode } from '../../../../../packages/types/src';

@Controller('public/forms')
export class PublicFormsController {
  private readonly logger = new Logger(PublicFormsController.name);

  constructor(
    private forms: FormsService,
    private contacts: ContactsService,
    private leads: LeadsService,
    private events: EventsService,
    private plugins: PluginRegistryService,
    private inquiry: InquiryService,
  ) {}

  @Get(':token')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Header('Cache-Control', 'public, max-age=60')
  async getPublicForm(
    @Param('token') token: string,
    /** Primary locale signal (ADR-0025). Unknown / missing → `en`. Not Accept-Language. */
    @Query('locale') locale?: string,
  ) {
    const form = await this.forms.findByToken(token);
    if (!form || !form.active) throw AppException.notFound('form');
    const resolved: LocaleCode = isLocaleCode(locale) ? locale : 'en';
    const adaptiveAvailable =
      form.destination === 'inquiry' &&
      form.intakeMode === 'adaptive' &&
      this.inquiry.hasAssistant();
    return this.forms.toPublicForm(form, resolved, { adaptiveAvailable });
  }

  @Post(':token/submit')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async submit(
    @Param('token') token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: FastifyRequest,
  ) {
    if (body['_hp']) return { success: true };

    const form = await this.forms.findByToken(token);
    if (!form || !form.active) throw AppException.notFound('form');

    // Inquiry-destination forms must use /public/forms/:token/inquiries instead
    if (form.destination === 'inquiry') {
      throw AppException.badRequest(
        'This form collects inquiries. Use POST /api/public/forms/:token/inquiries to submit.',
      );
    }

    try {
      const validated = this.forms.validateSubmission(form.schema, body);
      assertEmailPresent(validated);

      const rawEmail = String(validated['email']).trim();

      const source = this.extractSource(req);

      const contact = await this.contacts.upsertByEmail(rawEmail, {
        name: validated['name'] ? String(validated['name']) : undefined,
        submissionContext: {
          formId: form.id,
          formSlug: form.slug,
          formKind: form.kind,
          formName: form.name,
        },
      });
      const submission = await this.forms.createSubmission(form.id, contact.id, validated, source);

      this.events.emit('submission.created', {
        contactId: contact.id,
        formId: form.id,
        formName: form.name,
      });

      void this.plugins.emit({
        type: 'form.submitted',
        payload: {
          submissionId: submission.id,
          formId: form.id,
          formSlug: form.slug,
          formName: form.name,
          contactId: contact.id,
          contactEmail: rawEmail,
          data: validated,
          createdAt: submission.createdAt,
        },
      });

      this.leads
        .createFromSubmission({
          contactId: contact.id,
          submissionId: submission.id,
          submissionData: validated,
          formName: form.name,
          contactName: contact.name,
          contactEmail: rawEmail,
        })
        .catch((err) => this.logger.warn('Lead creation failed (non-blocking)', err));

      return { success: true, contactId: contact.id, submissionId: submission.id };
    } catch (e: any) {
      if (e instanceof BadRequestException || e instanceof NotFoundException) throw e;
      this.logger.error('Form submission error', e);
      throw AppException.badRequest('Submission failed');
    }
  }

  @Post(':token/adaptive/plan')
  /** LLM-backed — keep tighter than plain submit so bots cannot burn tokens. */
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async planAdaptive(@Param('token') token: string, @Body() body: Record<string, unknown>) {
    if (body['_hp']) return { questions: [] as string[] };

    const form = await this.forms.findByToken(token);
    if (!form || !form.active) throw AppException.notFound('form');
    if (form.destination !== 'inquiry' || form.intakeMode !== 'adaptive') {
      throw AppException.badRequest(
        'Planning questions is only available for adaptive inquiry forms.',
      );
    }

    const opening = String(body['opening'] ?? body['content'] ?? '').trim();
    assertPublicAdaptiveOpening(opening);
    const locale =
      typeof body['locale'] === 'string' ? body['locale'].trim().toLowerCase() : undefined;

    // Ephemeral — does not create an Inquiry row.
    return this.inquiry.planQuestions(form.id, {
      openingMessage: opening,
      count: 3,
      locale,
    });
  }

  @Post(':token/inquiries')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async createInquiry(
    @Param('token') token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: FastifyRequest,
  ) {
    // Honeypot check
    if (body['_hp']) return { success: true };

    const form = await this.forms.findByToken(token);
    if (!form || !form.active) throw AppException.notFound('form');

    if (form.destination !== 'inquiry') {
      throw AppException.badRequest(
        'This form does not collect inquiries. Use POST /api/public/forms/:token/submit.',
      );
    }

    const sourceMeta = this.extractSource(req);
    const contactName = body['name'] ? String(body['name']) : undefined;
    const email = body['email'] ? String(body['email']).trim() : undefined;
    const companyName =
      body['company'] || body['companyName']
        ? String(body['company'] ?? body['companyName'])
        : undefined;

    // Adaptive: one-shot — plan was ephemeral; persist opening + Q→A + contact once.
    if (form.intakeMode === 'adaptive') {
      const opening = String(body['opening'] ?? body['content'] ?? '').trim();
      const questions = Array.isArray(body['questions'])
        ? body['questions'].map((q) => String(q ?? '').trim())
        : [];
      const answers = Array.isArray(body['answers'])
        ? body['answers'].map((a) => String(a ?? '').trim())
        : [];
      const locale =
        typeof body['locale'] === 'string' ? body['locale'].trim().toLowerCase() : undefined;

      if (!opening || !questions.length || !answers.length) {
        throw AppException.badRequest(
          'Adaptive inquiry submit requires opening, questions[], and answers[] in one request. Call POST /api/public/forms/:token/adaptive/plan first (no DB write).',
        );
      }

      const created = await this.inquiry.submitAdaptiveIntake({
        formId: form.id,
        source: form.name,
        sourceMeta,
        opening,
        questions,
        answers,
        locale,
        contactName,
        email,
        companyName,
      });

      return {
        publicToken: created.publicToken,
        inquiryId: created.id,
        status: created.status,
        destination: form.destination,
        intakeMode: form.intakeMode,
      };
    }

    // Soft validation: validate against schema if non-empty, but do NOT require email
    if (form.schema && form.schema.length > 0) {
      try {
        this.forms.validateSubmission(form.schema, body);
      } catch {
        // For inquiry forms, soft-fail validation — let through with whatever data provided
      }
    }

    const created = await this.inquiry.createFromForm({
      formId: form.id,
      source: form.name,
      sourceMeta,
      contactName,
      email,
      companyName,
      structuredData: body as Record<string, unknown>,
    });

    return {
      publicToken: created.publicToken,
      inquiryId: created.id,
      status: created.status,
      destination: form.destination,
      intakeMode: form.intakeMode,
    };
  }

  private extractSource(req: FastifyRequest): SubmissionSource {
    const referer = req.headers.referer ?? req.headers.referrer;
    const userAgent = req.headers['user-agent'];
    const ip = req.ip;

    return {
      referer: typeof referer === 'string' ? referer : undefined,
      userAgent: typeof userAgent === 'string' ? userAgent : undefined,
      ip: typeof ip === 'string' ? ip : undefined,
    };
  }
}
