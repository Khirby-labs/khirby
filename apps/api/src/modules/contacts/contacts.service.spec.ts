import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { DB_TOKEN } from '../../core/database/database.module';

/**
 * Budujemy mock w dwóch warstwach:
 *  - db (bez .then) — NestJS DI nie traktuje go jako Promise
 *  - chain (z .then)  — każde wywołanie select/insert/update/delete zwraca chain
 *    który jest awaitable i dostarcza dane testowe
 */
function makeChain(result: any[] = []) {
  const chain: any = {};
  let _result = result;

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
    'orderBy',
  ].forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });

  // chain jest awaitable → NestJS DI nie dotyka db bezpośrednio, więc to bezpieczne
  chain.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(_result).then(onFulfilled, onRejected);

  chain.resolveWith = (r: any[]) => {
    _result = r;
    return chain;
  };

  return chain;
}

function buildDb() {
  const db: any = {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  // domyślne implementacje — każdy test może nadpisać mockImplementationOnce
  db.select.mockImplementation(() => makeChain([]));
  db.insert.mockImplementation(() => makeChain([]));
  db.update.mockImplementation(() => makeChain([]));
  db.delete.mockImplementation(() => makeChain([]));
  return db;
}

describe('ContactsService', () => {
  let service: ContactsService;
  let db: ReturnType<typeof buildDb>;

  beforeEach(async () => {
    db = buildDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ContactsService, { provide: DB_TOKEN, useValue: db }],
    }).compile();

    service = module.get(ContactsService);
  });

  // ─── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated data ordered by createdAt desc by default', async () => {
      const rows = [{ id: '1', email: 'a@b.com', name: 'A' }];
      const dataChain = makeChain(rows);
      const countChain = makeChain([{ count: 1 }]);

      db.select.mockImplementationOnce(() => dataChain).mockImplementationOnce(() => countChain);

      const result = await service.findAll({ page: 1, pageSize: 20 });
      expect(result.data).toEqual(rows);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.sortBy).toBe('createdAt');
      expect(result.sortDir).toBe('desc');
      expect(dataChain.orderBy).toHaveBeenCalled();
    });

    it('applies ILIKE filter when search is provided', async () => {
      const rows = [{ id: '2', email: 'foo@bar.com', name: 'Foo' }];

      db.select
        .mockImplementationOnce(() => makeChain(rows))
        .mockImplementationOnce(() => makeChain([{ count: 1 }]));

      const result = await service.findAll({ page: 1, pageSize: 20, search: 'foo' });
      expect(result.data).toEqual(rows);
      expect(result.total).toBe(1);
    });

    it('orders by email ascending when requested', async () => {
      const dataChain = makeChain([]);
      db.select
        .mockImplementationOnce(() => dataChain)
        .mockImplementationOnce(() => makeChain([{ count: 0 }]));

      const result = await service.findAll({ sortBy: 'email', sortDir: 'asc' });
      expect(result.sortBy).toBe('email');
      expect(result.sortDir).toBe('asc');
      expect(dataChain.orderBy).toHaveBeenCalled();
    });

    it('falls back to createdAt for unknown sortBy', async () => {
      db.select
        .mockImplementationOnce(() => makeChain([]))
        .mockImplementationOnce(() => makeChain([{ count: 0 }]));

      const result = await service.findAll({ sortBy: 'nope' as 'email' });
      expect(result.sortBy).toBe('createdAt');
    });

    it('applies hasPhone / formId / newsletter filters via where', async () => {
      const dataChain = makeChain([]);
      db.select
        .mockImplementationOnce(() => dataChain)
        .mockImplementationOnce(() => makeChain([{ count: 0 }]));

      await service.findAll({
        hasPhone: true,
        formId: 'form-1',
        newsletter: 'synced',
        createdFrom: '2026-08-01',
        createdTo: '2026-08-04',
      });
      expect(dataChain.where).toHaveBeenCalled();
    });
  });

  // ─── findById ───────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns contact with submissions and leads when found', async () => {
      const contact = { id: 'uuid-1', email: 'x@y.com' };
      const subs = [{ id: 'sub-1', contactId: 'uuid-1' }];
      const contactLeads = [{ id: 'lead-1', title: 'Deal', stageName: 'New' }];

      db.select
        .mockImplementationOnce(() => makeChain([contact])) // contact query
        .mockImplementationOnce(() => makeChain(subs)) // submissions query
        .mockImplementationOnce(() => makeChain(contactLeads)); // leads query

      const result = await service.findById('uuid-1');
      expect(result).toMatchObject({ id: 'uuid-1' });
      expect(result?.submissions).toEqual(subs);
      expect(result?.leads).toEqual(contactLeads);
    });

    it('returns null when contact not found', async () => {
      db.select.mockImplementationOnce(() => makeChain([]));

      const result = await service.findById('not-exist');
      expect(result).toBeNull();
    });
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a new contact successfully', async () => {
      const newContact = { id: 'uuid-2', email: 'new@email.com', name: 'New' };

      db.select.mockImplementationOnce(() => makeChain([])); // no conflict
      db.insert.mockImplementationOnce(() => makeChain([newContact]));

      const result = await service.create({ email: 'new@email.com', name: 'New' });
      expect(result).toEqual(newContact);
      expect(db.insert).toHaveBeenCalled();
    });

    it('throws ConflictException if email already exists', async () => {
      const existing = { id: 'uuid-3', email: 'dup@email.com' };
      db.select.mockImplementationOnce(() => makeChain([existing]));

      await expect(service.create({ email: 'dup@email.com' })).rejects.toThrow(ConflictException);
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates contact when it exists', async () => {
      const existing = { id: 'uuid-4', email: 'upd@email.com', name: 'Old', phone: null };
      const updated = { ...existing, name: 'New Name', phone: '+48123123123' };

      db.select.mockImplementationOnce(() => makeChain([existing]));
      db.update.mockImplementationOnce(() => makeChain([updated]));

      const result = await service.update('uuid-4', { name: 'New Name', phone: '+48123123123' });
      expect(result).toEqual(updated);
    });

    it('updates email when the new address is free', async () => {
      const existing = { id: 'uuid-4', email: 'old@email.com', name: 'Ada', phone: null };
      const updated = { ...existing, email: 'new@email.com' };

      db.select
        .mockImplementationOnce(() => makeChain([existing]))
        .mockImplementationOnce(() => makeChain([])); // no conflict
      db.update.mockImplementationOnce(() => makeChain([updated]));

      const result = await service.update('uuid-4', { email: 'new@email.com' });
      expect(result).toEqual(updated);
    });

    it('throws ConflictException when email already belongs to another contact', async () => {
      const existing = { id: 'uuid-4', email: 'old@email.com', name: 'Ada', phone: null };
      const other = { id: 'uuid-9', email: 'taken@email.com' };

      db.select
        .mockImplementationOnce(() => makeChain([existing]))
        .mockImplementationOnce(() => makeChain([other]));

      await expect(service.update('uuid-4', { email: 'taken@email.com' })).rejects.toThrow(
        ConflictException,
      );
      expect(db.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when contact does not exist', async () => {
      db.select.mockImplementationOnce(() => makeChain([]));

      await expect(service.update('no-id', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── delete ─────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes contact when it exists', async () => {
      const existing = { id: 'uuid-5', email: 'del@email.com' };

      db.select.mockImplementationOnce(() => makeChain([existing]));
      db.delete.mockImplementationOnce(() => makeChain([]));

      const result = await service.delete('uuid-5');
      expect(result).toEqual({ deleted: true });
    });

    it('throws NotFoundException when contact does not exist', async () => {
      db.select.mockImplementationOnce(() => makeChain([]));

      await expect(service.delete('no-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── upsertByEmail ──────────────────────────────────────────────────────────

  describe('upsertByEmail', () => {
    it('returns existing contact unchanged when no enrichment data', async () => {
      const existing = { id: 'uuid-6', email: 'exists@x.com', name: 'Ada', metadata: {} };
      db.select.mockImplementationOnce(() => makeChain([existing]));

      const result = await service.upsertByEmail('exists@x.com', {});
      expect(result).toEqual(existing);
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('merges form interest and updates name for existing contact', async () => {
      const existing = {
        id: 'uuid-6',
        email: 'exists@x.com',
        name: null,
        metadata: {},
      };
      const updated = {
        ...existing,
        name: 'Ada',
        metadata: {
          interests: [
            {
              formId: 'f1',
              formSlug: 'pokelo-waitlist',
              formKind: 'waitlist',
              formName: 'Pokelo Waitlist',
              lastSubmittedAt: expect.any(String),
              firstSubmittedAt: expect.any(String),
            },
          ],
        },
      };

      db.select.mockImplementationOnce(() => makeChain([existing]));
      db.update.mockImplementationOnce(() => makeChain([updated]));

      const result = await service.upsertByEmail('exists@x.com', {
        name: 'Ada',
        submissionContext: {
          formId: 'f1',
          formSlug: 'pokelo-waitlist',
          formKind: 'waitlist',
          formName: 'Pokelo Waitlist',
        },
      });

      expect(result).toEqual(updated);
      expect(db.update).toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('appends another form interest when user submits a second product form', async () => {
      const existing = {
        id: 'uuid-6',
        email: 'exists@x.com',
        name: 'Ada',
        metadata: {
          interests: [
            {
              formId: 'f1',
              formSlug: 'pokelo-waitlist',
              formKind: 'waitlist',
              formName: 'Pokelo Waitlist',
              firstSubmittedAt: '2026-07-01T00:00:00.000Z',
              lastSubmittedAt: '2026-07-01T00:00:00.000Z',
            },
          ],
        },
      };
      const updated = {
        ...existing,
        metadata: {
          interests: [
            existing.metadata.interests[0],
            {
              formId: 'f2',
              formSlug: 'finsly-contact',
              formKind: 'contact',
              formName: 'Finsly Contact',
              firstSubmittedAt: expect.any(String),
              lastSubmittedAt: expect.any(String),
            },
          ],
        },
      };

      db.select.mockImplementationOnce(() => makeChain([existing]));
      db.update.mockImplementationOnce(() => makeChain([updated]));

      const result = await service.upsertByEmail('exists@x.com', {
        submissionContext: {
          formId: 'f2',
          formSlug: 'finsly-contact',
          formKind: 'contact',
          formName: 'Finsly Contact',
        },
      });

      expect(result).toEqual(updated);
      expect(db.update).toHaveBeenCalled();
    });

    it('creates new contact with initial form interest', async () => {
      const created = {
        id: 'uuid-7',
        email: 'brand@new.com',
        name: 'Brand New',
        metadata: {
          interests: [
            {
              formId: 'f1',
              formSlug: 'pokelo-waitlist',
              formKind: 'waitlist',
              formName: 'Pokelo Waitlist',
              firstSubmittedAt: expect.any(String),
              lastSubmittedAt: expect.any(String),
            },
          ],
        },
      };

      db.select.mockImplementationOnce(() => makeChain([]));
      db.insert.mockImplementationOnce(() => makeChain([created]));

      const result = await service.upsertByEmail('brand@new.com', {
        name: 'Brand New',
        submissionContext: {
          formId: 'f1',
          formSlug: 'pokelo-waitlist',
          formKind: 'waitlist',
          formName: 'Pokelo Waitlist',
        },
      });
      expect(result).toEqual(created);
      expect(db.insert).toHaveBeenCalled();
    });
  });
});
