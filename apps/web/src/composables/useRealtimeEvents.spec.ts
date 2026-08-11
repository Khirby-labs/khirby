import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { defineComponent, h } from 'vue';
import { type VueWrapper } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import type { FormListItem, LeadBoard } from '@khirby/types';
import { useRealtimeEvents } from './useRealtimeEvents';
import { usePipelineStore } from '../stores/pipeline.store';
import { useFormsStore } from '../stores/forms.store';
import { useMailStore } from '../stores/mail.store';
import { server } from '../test/msw/server';
import { api } from '../test/api-base';
import { mountWithI18n } from '../test/i18n';

/**
 * useRealtimeEvents wires a browser EventSource (the boundary) to store actions.
 * We stub EventSource, drive real messages through it, and assert the observable
 * effect: the store reconciles to server truth via a real fetch (MSW), malformed
 * frames are ignored, and the connection is torn down on unmount.
 */

type MessageHandler = (e: MessageEvent) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  static get last() {
    return MockEventSource.instances[MockEventSource.instances.length - 1];
  }

  url: string;
  withCredentials: boolean;
  onmessage: MessageHandler | null = null;
  closed = false;

  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = Boolean(init?.withCredentials);
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  /** Simulate a server-sent frame. `raw` lets a test push malformed JSON. */
  emit(payload: unknown, raw = false) {
    const data = raw ? (payload as string) : JSON.stringify(payload);
    this.onmessage?.(new MessageEvent('message', { data }));
  }
}

// Host component so onMounted/onUnmounted lifecycle hooks actually fire.
const Host = defineComponent({
  setup() {
    useRealtimeEvents();
    return () => h('div');
  },
});

function boardWith(stageOfL1: 'A' | 'B'): LeadBoard {
  const l1 = {
    id: 'l1',
    contactId: 'c1',
    submissionId: null,
    stageId: stageOfL1,
    ownerId: null,
    title: 'Lead l1',
    value: '100',
    priority: 'medium' as const,
    formName: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    contactEmail: 'l1@example.com',
    contactName: null,
    ownerEmail: null,
    hasNewMail: false,
    lastMailAt: null,
  };
  const emptyStage = (id: string, position: number) => ({
    id,
    name: id,
    color: '#000',
    position,
    isWon: false,
    isLost: false,
  });
  return {
    columns: [
      {
        stage: emptyStage('A', 0),
        leads: stageOfL1 === 'A' ? [l1] : [],
        count: stageOfL1 === 'A' ? 1 : 0,
        totalValue: stageOfL1 === 'A' ? '100' : '0',
      },
      {
        stage: emptyStage('B', 1),
        leads: stageOfL1 === 'B' ? [l1] : [],
        count: stageOfL1 === 'B' ? 1 : 0,
        totalValue: stageOfL1 === 'B' ? '100' : '0',
      },
    ],
  };
}

const form = (id: string, submissionCount: number): FormListItem => ({
  id,
  name: `Form ${id}`,
  slug: id,
  kind: 'contact',
  schema: [],
  endpointToken: `tok-${id}`,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  submissionCount,
});

describe('useRealtimeEvents', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    setActivePinia(createPinia());
    MockEventSource.instances.length = 0;
    vi.stubGlobal('EventSource', MockEventSource);
  });

  afterEach(() => {
    wrapper?.unmount();
    vi.unstubAllGlobals();
  });

  it('opens the stream with credentials on mount', () => {
    wrapper = mountWithI18n(Host);

    const es = MockEventSource.last;
    expect(es.url).toBe('/api/events/stream');
    expect(es.withCredentials).toBe(true);
  });

  it('reconciles the board to server truth when a lead.moved event arrives', async () => {
    // Server now says l1 lives in B; local (optimistic) state still shows it in A.
    server.use(http.get(api('/api/leads/board'), () => HttpResponse.json(boardWith('B'))));

    const pipeline = usePipelineStore();
    pipeline.board = boardWith('A'); // stale local state
    wrapper = mountWithI18n(Host);

    MockEventSource.last.emit({ type: 'lead.moved', data: { id: 'l1' } });

    await vi.waitFor(() => {
      const b = pipeline.board!.columns.find((c) => c.stage.id === 'B')!;
      expect(b.leads.map((l) => l.id)).toEqual(['l1']);
    });
    const a = pipeline.board!.columns.find((c) => c.stage.id === 'A')!;
    expect(a.leads).toEqual([]); // no duplication — server state fully replaced local
  });

  it('ignores a malformed frame without crashing or refetching', async () => {
    let boardHits = 0;
    server.use(
      http.get(api('/api/leads/board'), () => {
        boardHits += 1;
        return HttpResponse.json(boardWith('A'));
      }),
    );

    const pipeline = usePipelineStore();
    wrapper = mountWithI18n(Host);

    expect(() => MockEventSource.last.emit('{not json', true)).not.toThrow();

    // Give any (erroneous) async refetch a chance to fire, then assert none did.
    await Promise.resolve();
    expect(boardHits).toBe(0);
    expect(pipeline.board).toBeNull();
  });

  it('increments a form submission count on submission.created', () => {
    const forms = useFormsStore();
    forms.forms = [form('f1', 2), form('f2', 0)];
    wrapper = mountWithI18n(Host);

    MockEventSource.last.emit({ type: 'submission.created', data: { formId: 'f1' } });

    expect(forms.forms.find((f) => f.id === 'f1')!.submissionCount).toBe(3);
    expect(forms.forms.find((f) => f.id === 'f2')!.submissionCount).toBe(0);
  });

  it('refreshes mail threads and the pipeline board when email.received arrives', async () => {
    let listHits = 0;
    let boardHits = 0;
    server.use(
      http.get(api('/api/mail/threads'), () => {
        listHits += 1;
        return HttpResponse.json({
          items: [
            {
              id: 't1',
              subject: 'Hello',
              contactId: null,
              contactEmail: null,
              contactName: null,
              leadId: null,
              leadTitle: null,
              lastMessageAt: '2026-07-29T00:00:00.000Z',
              messageCount: 2,
              lastDirection: 'inbound',
              createdAt: '2026-07-29T00:00:00.000Z',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        });
      }),
      http.get(api('/api/mail/threads/t1'), () =>
        HttpResponse.json({
          id: 't1',
          subject: 'Hello',
          contactId: null,
          contactEmail: null,
          contactName: null,
          leadId: null,
          leadTitle: null,
          lastMessageAt: '2026-07-29T00:00:00.000Z',
          messageCount: 2,
          lastDirection: 'inbound',
          createdAt: '2026-07-29T00:00:00.000Z',
          messages: [],
        }),
      ),
      http.get(api('/api/leads/board'), () => {
        boardHits += 1;
        return HttpResponse.json(boardWith('A'));
      }),
    );

    const mail = useMailStore();
    await mail.listThreads({ page: 1 });
    expect(listHits).toBe(1);

    wrapper = mountWithI18n(Host);
    MockEventSource.last.emit({ type: 'email.received', data: { threadId: 't1' } });

    await vi.waitFor(() => expect(listHits).toBe(2));
    await vi.waitFor(() => expect(boardHits).toBeGreaterThanOrEqual(1));
  });

  it('closes the stream on unmount', () => {
    wrapper = mountWithI18n(Host);
    const es = MockEventSource.last;
    expect(es.closed).toBe(false);

    wrapper.unmount();
    wrapper = undefined as unknown as VueWrapper; // prevent double-unmount in afterEach

    expect(es.closed).toBe(true);
  });
});
