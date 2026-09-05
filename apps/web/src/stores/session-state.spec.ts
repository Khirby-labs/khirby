import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { http, HttpResponse } from 'msw';
import { useAuthStore } from './auth.store';
import { useMailStore } from './mail.store';
import { useBoardsStore } from './boards.store';
import { usePipelineStore } from './pipeline.store';
import { server } from '../test/msw/server';
import { api } from '../test/api-base';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('session data isolation', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('does not reuse the previous account mail filters after session reset', async () => {
    const auth = useAuthStore();
    const mail = useMailStore();
    const contactIds: (string | null)[] = [];
    server.use(
      http.get(api('/api/mail/threads'), ({ request }) => {
        contactIds.push(new URL(request.url).searchParams.get('contactId'));
        return HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 20 });
      }),
    );
    auth.user = { id: 'a', email: 'a@example.invalid', permissions: [], locale: null };
    await mail.listThreads({ contactId: 'contact-a' });
    await mail.onMailEvent({});
    expect(contactIds).toEqual(['contact-a', 'contact-a']);

    auth.clearSession();
    auth.user = { id: 'b', email: 'b@example.invalid', permissions: [], locale: null };
    await mail.onMailEvent({});
    expect(contactIds).toEqual(['contact-a', 'contact-a']);

    await mail.listThreads({ contactId: 'contact-b' });
    await mail.onMailEvent({});
    expect(contactIds).toEqual(['contact-a', 'contact-a', 'contact-b', 'contact-b']);
  });

  it('clears loaded mail and rejects a delayed previous-session response', async () => {
    const auth = useAuthStore();
    const mail = useMailStore();
    mail.threads = [{ id: 'private-a', subject: 'Private account A' }] as any;
    mail.threadDetails = {
      'private-a': { id: 'private-a', messages: [{ bodyText: 'secret' }] },
    } as any;
    const started = deferred();
    const release = deferred();
    server.use(
      http.get(api('/api/mail/threads'), async () => {
        started.resolve();
        await release.promise;
        return HttpResponse.json({ items: [{ id: 'late-private-a' }], total: 1 });
      }),
    );
    const pending = mail.listThreads();
    await started.promise;
    auth.clearSession();
    auth.user = { id: 'b', email: 'b@example.invalid', permissions: [], locale: null };
    release.resolve();
    await pending;
    expect(mail.threads).toEqual([]);
    expect(mail.threadDetails).toEqual({});
  });

  it('does not restore an old task-board snapshot when an optimistic request is aborted', async () => {
    const auth = useAuthStore();
    const boards = useBoardsStore();
    boards.board = {
      statuses: [],
      tasks: [{ id: 'private-a', title: 'Secret', statusId: 'old' }],
    } as any;
    const started = deferred();
    const release = deferred();
    server.use(
      http.patch(api('/api/boards/tasks/private-a/status'), async () => {
        started.resolve();
        await release.promise;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const pending = boards.moveTask('private-a', 'new', 1).catch(() => undefined);
    await started.promise;
    auth.clearSession();
    release.resolve();
    await pending;
    expect(boards.board).toBeNull();
  });

  it('does not restore an old sales-board snapshot after session reset', async () => {
    const auth = useAuthStore();
    const pipeline = usePipelineStore();
    pipeline.board = {
      columns: [
        {
          stage: { id: 'old' },
          leads: [{ id: 'private-a', title: 'Secret', value: '1' }],
          count: 1,
          totalValue: '1',
        },
        { stage: { id: 'new' }, leads: [], count: 0, totalValue: '0' },
      ],
    } as any;
    const started = deferred();
    const release = deferred();
    server.use(
      http.patch(api('/api/leads/private-a'), async () => {
        started.resolve();
        await release.promise;
        return HttpResponse.json({ id: 'private-a' });
      }),
    );
    const pending = pipeline.moveLead('private-a', 'new').catch(() => undefined);
    await started.promise;
    auth.clearSession();
    release.resolve();
    await pending;
    expect(pipeline.board).toBeNull();
  });
});
