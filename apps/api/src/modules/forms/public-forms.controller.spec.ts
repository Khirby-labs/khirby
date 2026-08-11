import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { PublicFormsController } from './public-forms.controller';

/**
 * Boundary test for the unauthenticated public form surface. Collaborators are mocked;
 * validateSubmission is stubbed to strip the honeypot, but assertEmailPresent runs for real
 * (imported from validate-submission-data), so email rules are exercised end-to-end.
 */
describe('PublicFormsController', () => {
  let controller: PublicFormsController;
  let forms: any;
  let contacts: any;
  let leads: any;
  let events: any;
  let plugins: any;

  const activeForm = {
    id: 'f1',
    slug: 'contact',
    kind: 'contact',
    name: 'Contact us',
    active: true,
    schema: [{ name: 'email', label: 'Email', type: 'email', required: true }],
  };

  function makeReq(headers: Record<string, unknown> = {}, ip = '203.0.113.9') {
    return { headers, ip } as any;
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    forms = {
      findByToken: jest.fn().mockResolvedValue(activeForm),
      toPublicForm: jest.fn((f: any) => ({
        name: f.name,
        slug: f.slug,
        kind: f.kind,
        fields: f.schema,
      })),
      validateSubmission: jest.fn((_schema: unknown, body: Record<string, unknown>) => {
        const data = { ...body };
        delete data['_hp'];
        return data;
      }),
      createSubmission: jest
        .fn()
        .mockResolvedValue({ id: 'sub1', createdAt: new Date('2026-01-01') }),
    };
    contacts = { upsertByEmail: jest.fn().mockResolvedValue({ id: 'c1', name: 'Ada' }) };
    leads = { createFromSubmission: jest.fn().mockResolvedValue(undefined) };
    events = { emit: jest.fn() };
    plugins = { emit: jest.fn() };

    controller = new PublicFormsController(forms, contacts, leads, events, plugins);
  });

  afterEach(() => jest.restoreAllMocks());

  // ─── getPublicForm ──────────────────────────────────────────────────────────

  describe('getPublicForm', () => {
    it('returns the public shape for an active form (default locale en)', async () => {
      const result = await controller.getPublicForm('tok');
      expect(forms.toPublicForm).toHaveBeenCalledWith(activeForm, 'en');
      expect(result).toEqual({
        name: 'Contact us',
        slug: 'contact',
        kind: 'contact',
        fields: activeForm.schema,
      });
    });

    it('passes a supported locale query to toPublicForm', async () => {
      await controller.getPublicForm('tok', 'pl');
      expect(forms.toPublicForm).toHaveBeenCalledWith(activeForm, 'pl');
    });

    it('falls back to en for an unknown locale query', async () => {
      await controller.getPublicForm('tok', 'de');
      expect(forms.toPublicForm).toHaveBeenCalledWith(activeForm, 'en');
    });

    it('404s when the form is missing', async () => {
      forms.findByToken.mockResolvedValueOnce(null);
      await expect(controller.getPublicForm('tok')).rejects.toThrow(NotFoundException);
    });

    it('404s when the form is inactive', async () => {
      forms.findByToken.mockResolvedValueOnce({ ...activeForm, active: false });
      await expect(controller.getPublicForm('tok')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── submit: guard paths ──────────────────────────────────────────────────────

  describe('submit — guards', () => {
    it('drops honeypot hits without touching the DB', async () => {
      const result = await controller.submit('tok', { _hp: 'bot', email: 'x@y.co' }, makeReq());
      expect(result).toEqual({ success: true });
      expect(forms.findByToken).not.toHaveBeenCalled();
      expect(contacts.upsertByEmail).not.toHaveBeenCalled();
    });

    it('404s when the form is missing', async () => {
      forms.findByToken.mockResolvedValueOnce(null);
      await expect(controller.submit('tok', { email: 'a@b.co' }, makeReq())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404s when the form is inactive', async () => {
      forms.findByToken.mockResolvedValueOnce({ ...activeForm, active: false });
      await expect(controller.submit('tok', { email: 'a@b.co' }, makeReq())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects a submission with no valid email and never creates a contact', async () => {
      await expect(controller.submit('tok', { name: 'Ada' }, makeReq())).rejects.toThrow(
        BadRequestException,
      );
      expect(contacts.upsertByEmail).not.toHaveBeenCalled();
    });
  });

  // ─── submit: happy path & orchestration ───────────────────────────────────────

  describe('submit — happy path', () => {
    it('upserts a contact, stores the submission, emits the event and returns ids', async () => {
      const result = await controller.submit(
        'tok',
        { email: 'ada@example.com', name: 'Ada' },
        makeReq({ referer: 'https://site.test/x', 'user-agent': 'jest' }, '198.51.100.7'),
      );

      expect(contacts.upsertByEmail).toHaveBeenCalledWith(
        'ada@example.com',
        expect.objectContaining({ name: 'Ada' }),
      );
      expect(forms.createSubmission).toHaveBeenCalledWith(
        'f1',
        'c1',
        { email: 'ada@example.com', name: 'Ada' },
        { referer: 'https://site.test/x', userAgent: 'jest', ip: '198.51.100.7' },
      );
      expect(events.emit).toHaveBeenCalledWith('submission.created', {
        contactId: 'c1',
        formId: 'f1',
        formName: 'Contact us',
      });
      expect(plugins.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'form.submitted',
          payload: expect.objectContaining({
            submissionId: 'sub1',
            formSlug: 'contact',
            formName: 'Contact us',
            contactEmail: 'ada@example.com',
          }),
        }),
      );
      expect(result).toEqual({ success: true, contactId: 'c1', submissionId: 'sub1' });
    });

    it('does not fail the request when lead creation rejects (non-blocking)', async () => {
      leads.createFromSubmission.mockRejectedValueOnce(new Error('leads down'));
      await expect(
        controller.submit('tok', { email: 'ada@example.com' }, makeReq()),
      ).resolves.toMatchObject({ success: true });
    });

    it('masks an unexpected collaborator error as a generic BadRequest', async () => {
      contacts.upsertByEmail.mockRejectedValueOnce(new Error('db exploded'));
      await expect(
        controller.submit('tok', { email: 'ada@example.com' }, makeReq()),
      ).rejects.toThrow(new BadRequestException('Submission failed'));
    });
  });
});
