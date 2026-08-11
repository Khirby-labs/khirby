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
import { PluginRegistryService } from '../plugins/plugin-registry.service';
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
    return this.forms.toPublicForm(form, resolved);
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
