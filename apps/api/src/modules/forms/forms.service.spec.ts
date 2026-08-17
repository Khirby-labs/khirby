import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FormsService } from './forms.service';
import { DB_TOKEN } from '../../core/database/database.module';

/**
 * Mock DB — db sam nie ma .then (NestJS DI nie traktuje jako Promise).
 * Każda metoda (select/insert/update/delete) zwraca chain który jest awaitable.
 */
function makeChain(result: any[] = []) {
  const chain: any = {};
  const _result = result;

  [
    'from',
    'where',
    'limit',
    'offset',
    'values',
    'set',
    'returning',
    'onConflictDoNothing',
    'leftJoin',
    'innerJoin',
    'groupBy',
    'orderBy',
  ].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });

  chain.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(_result).then(onFulfilled, onRejected);

  return chain;
}

function buildDb() {
  const db: any = {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  db.select.mockImplementation(() => makeChain([]));
  db.insert.mockImplementation(() => makeChain([]));
  db.update.mockImplementation(() => makeChain([]));
  db.delete.mockImplementation(() => makeChain([]));
  return db;
}

describe('FormsService', () => {
  let service: FormsService;
  let module: TestingModule;
  let db: ReturnType<typeof buildDb>;

  beforeEach(async () => {
    db = buildDb();

    module = await Test.createTestingModule({
      providers: [FormsService, { provide: DB_TOKEN, useValue: db }],
    }).compile();

    service = module.get(FormsService);
  });

  afterEach(async () => {
    await module?.close();
  });

  // ─── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all forms', async () => {
      const rows = [{ id: 'f1', name: 'Form 1', slug: 'form-1' }];
      db.select.mockImplementationOnce(() => makeChain(rows));

      const result = await service.findAll();
      expect(result).toEqual(rows);
      expect(db.select).toHaveBeenCalled();
    });
  });

  // ─── findById ───────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns form when found', async () => {
      const form = { id: 'f1', name: 'Form 1', slug: 'form-1' };
      db.select.mockImplementationOnce(() => makeChain([form]));

      const result = await service.findById('f1');
      expect(result).toEqual(form);
    });

    it('returns null when not found', async () => {
      db.select.mockImplementationOnce(() => makeChain([]));

      const result = await service.findById('nope');
      expect(result).toBeNull();
    });
  });

  // ─── findByToken ────────────────────────────────────────────────────────────

  describe('findByToken', () => {
    it('returns form by endpoint token', async () => {
      const form = { id: 'f2', name: 'Token Form', slug: 'token-form', endpointToken: 'tok-123' };
      db.select.mockImplementationOnce(() => makeChain([form]));

      const result = await service.findByToken('tok-123');
      expect(result).toEqual(form);
    });

    it('returns null when token does not match', async () => {
      db.select.mockImplementationOnce(() => makeChain([]));

      const result = await service.findByToken('bad-token');
      expect(result).toBeNull();
    });
  });

  describe('toPublicForm', () => {
    it('maps internal form to public shape without internal ids (legacy label only)', () => {
      const result = service.toPublicForm({
        name: 'Contact',
        slug: 'contact',
        kind: 'contact',
        schema: [{ name: 'email', label: 'Email', type: 'email', required: true }],
      });
      expect(result).toEqual({
        name: 'Contact',
        slug: 'contact',
        kind: 'contact',
        fields: [{ name: 'email', label: 'Email', type: 'email', required: true }],
      });
    });

    it('resolves labels[locale] when present', () => {
      const result = service.toPublicForm(
        {
          name: 'Contact',
          slug: 'contact',
          kind: 'contact',
          schema: [
            {
              name: 'email',
              label: 'Email',
              labels: { en: 'Email', pl: 'E-mail' },
              type: 'email',
              required: true,
            },
          ],
        },
        'pl',
      );
      expect(result.fields[0]).toEqual({
        name: 'email',
        label: 'E-mail',
        type: 'email',
        required: true,
      });
      expect(result.fields[0]).not.toHaveProperty('labels');
    });

    it('falls back to labels.en then label when locale entry is missing', () => {
      const onlyEn = service.toPublicForm(
        {
          name: 'Contact',
          slug: 'contact',
          kind: 'contact',
          schema: [
            {
              name: 'name',
              label: 'Legacy Name',
              labels: { en: 'Full name' },
              type: 'text',
              required: true,
            },
          ],
        },
        'pl',
      );
      expect(onlyEn.fields[0].label).toBe('Full name');

      const legacyOnly = service.toPublicForm(
        {
          name: 'Contact',
          slug: 'contact',
          kind: 'contact',
          schema: [{ name: 'name', label: 'Legacy Name', type: 'text', required: true }],
        },
        'pl',
      );
      expect(legacyOnly.fields[0].label).toBe('Legacy Name');
    });

    it('defaults locale to en when omitted', () => {
      const result = service.toPublicForm({
        name: 'Contact',
        slug: 'contact',
        kind: 'contact',
        schema: [
          {
            name: 'email',
            label: 'Fallback',
            labels: { en: 'Email', pl: 'E-mail' },
            type: 'email',
            required: true,
          },
        ],
      });
      expect(result.fields[0].label).toBe('Email');
    });
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a form when slug is unique', async () => {
      const newForm = { id: 'f3', name: 'New Form', slug: 'new-form', schema: [], active: true };

      db.select.mockImplementationOnce(() => makeChain([])); // no slug conflict
      db.insert.mockImplementationOnce(() => makeChain([newForm])); // insert → new form

      const result = await service.create({ name: 'New Form', slug: 'new-form', schema: [] });
      expect(result).toEqual(newForm);
      expect(db.insert).toHaveBeenCalled();
    });

    it('throws ConflictException when slug already exists', async () => {
      const existing = { id: 'f4', slug: 'dup-slug' };
      db.select.mockImplementationOnce(() => makeChain([existing]));

      await expect(service.create({ name: 'Dup', slug: 'dup-slug', schema: [] })).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects a non-empty schema without a required email field', async () => {
      await expect(
        service.create({
          name: 'F',
          slug: 'f',
          schema: [{ name: 'message', label: 'Message', type: 'textarea', required: true }],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('accepts a schema that has a required email field', async () => {
      const newForm = { id: 'fe', name: 'F', slug: 'f', schema: [], active: true };
      db.select.mockImplementationOnce(() => makeChain([])); // no slug conflict
      db.insert.mockImplementationOnce(() => makeChain([newForm])); // insert → new form

      const result = await service.create({
        name: 'F',
        slug: 'f',
        schema: [{ name: 'email', label: 'Email', type: 'email', required: true }],
      });
      expect(result).toEqual(newForm);
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates a form successfully', async () => {
      const existing = { id: 'f5', name: 'Old', slug: 'old-slug', schema: [], active: true };
      const updated = { ...existing, name: 'Updated' };

      db.select.mockImplementationOnce(() => makeChain([existing])); // findById
      db.update.mockImplementationOnce(() => makeChain([updated])); // update

      const result = await service.update('f5', { name: 'Updated' });
      expect(result).toEqual(updated);
      expect(db.update).toHaveBeenCalled();
    });

    it('throws NotFoundException when form does not exist', async () => {
      db.select.mockImplementationOnce(() => makeChain([]));

      await expect(service.update('no-id', { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when new slug is already taken by another form', async () => {
      const existing = { id: 'f6', name: 'Form', slug: 'slug-a', schema: [], active: true };
      const conflicting = { id: 'f7', slug: 'slug-b' };

      db.select
        .mockImplementationOnce(() => makeChain([existing])) // findById
        .mockImplementationOnce(() => makeChain([conflicting])); // slug conflict check

      await expect(service.update('f6', { slug: 'slug-b' })).rejects.toThrow(ConflictException);
    });

    it('rejects a schema update without a required email field', async () => {
      const existing = { id: 'fx', name: 'F', slug: 'f', schema: [], active: true };
      db.select.mockImplementationOnce(() => makeChain([existing])); // findById

      await expect(
        service.update('fx', {
          schema: [{ name: 'message', label: 'Message', type: 'textarea', required: true }],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('allows update with same slug (no conflict)', async () => {
      const existing = { id: 'f8', name: 'Form', slug: 'same-slug', schema: [], active: true };
      const updatedForm = { ...existing, active: false };

      db.select.mockImplementationOnce(() => makeChain([existing]));
      db.update.mockImplementationOnce(() => makeChain([updatedForm]));

      const result = await service.update('f8', { active: false });
      expect(result).toEqual(updatedForm);
    });
  });

  // ─── delete ─────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes form when it exists', async () => {
      const existing = { id: 'f9', slug: 'del-slug' };
      db.select.mockImplementationOnce(() => makeChain([existing]));
      db.delete.mockImplementationOnce(() => makeChain([]));

      const result = await service.delete('f9');
      expect(result).toEqual({ deleted: true });
    });

    it('throws NotFoundException when form does not exist', async () => {
      db.select.mockImplementationOnce(() => makeChain([]));

      await expect(service.delete('ghost-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createSubmission ───────────────────────────────────────────────────────

  describe('createSubmission', () => {
    it('inserts and returns a submission', async () => {
      const sub = {
        id: 's1',
        formId: 'f10',
        contactId: 'c1',
        data: { email: 'a@b.com' },
        source: { referer: 'https://example.com' },
      };
      db.insert.mockImplementationOnce(() => makeChain([sub]));

      const result = await service.createSubmission(
        'f10',
        'c1',
        { email: 'a@b.com' },
        { referer: 'https://example.com' },
      );
      expect(result).toEqual(sub);
    });
  });

  describe('validateSubmission', () => {
    const schema = [
      { name: 'email', type: 'email', required: true },
      { name: 'phone', type: 'tel', required: false },
    ];

    it('passes when all required fields are present', () => {
      const body = { email: 'test@test.com' };
      expect(service.validateSubmission(schema, body)).toEqual(body);
    });

    it('throws BadRequestException when a required field is missing', () => {
      const body = { phone: '123' };
      expect(() => service.validateSubmission(schema, body)).toThrow(/required/i);
    });

    it('rejects unknown fields', () => {
      expect(() =>
        service.validateSubmission(schema, { email: 'test@test.com', extra: 'x' }),
      ).toThrow(/unknown field/i);
    });
  });
});
