import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setActivePinia, createPinia } from 'pinia';
import type { LeadBoard, LeadBoardColumn, LeadBoardItem, PipelineStage } from '@khirby/types';
import { usePipelineStore } from './pipeline.store';
import { useToastStore } from './toast.store';
import { server } from '../test/msw/server';
import { api } from '../test/api-base';

// --- fixtures, shaped from @khirby/types so a drift in the API shape fails typecheck ---

function stage(id: string, position: number): PipelineStage {
  return { id, name: id, color: '#000', position, isWon: false, isLost: false };
}

function lead(id: string, stageId: string, value: string): LeadBoardItem {
  return {
    id,
    contactId: `c-${id}`,
    submissionId: null,
    stageId,
    ownerId: null,
    title: `Lead ${id}`,
    value,
    priority: 'medium',
    formName: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    contactEmail: `${id}@example.com`,
    contactName: null,
    ownerEmail: null,
    hasNewMail: false,
    lastMailAt: null,
  };
}

function column(s: PipelineStage, leads: LeadBoardItem[]): LeadBoardColumn {
  return {
    stage: s,
    leads,
    count: leads.length,
    totalValue: String(leads.reduce((acc, l) => acc + Number(l.value ?? 0), 0)),
  };
}

// Board: A = [l1(100), l2(200)] · B = [l3(50)]
function board(): LeadBoard {
  return {
    columns: [
      column(stage('A', 0), [lead('l1', 'A', '100'), lead('l2', 'A', '200')]),
      column(stage('B', 1), [lead('l3', 'B', '50')]),
    ],
  };
}

const colById = (b: LeadBoard, id: string) => b.columns.find((c) => c.stage.id === id)!;

describe('pipeline.store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('fetchBoard GETs /api/leads/board and stores the result', async () => {
    let requestedUrl = '';
    server.use(
      http.get(api('/api/leads/board'), ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json(board());
      }),
    );

    const store = usePipelineStore();
    await store.fetchBoard();

    expect(store.board?.columns).toHaveLength(2);
    expect(store.error).toBe('');
    expect(store.loading).toBe(false);
    // no ownerId filter → no query string
    expect(requestedUrl.endsWith('/api/leads/board')).toBe(true);
  });

  it('fetchBoard passes ?ownerId= when filtering by owner', async () => {
    let requestedUrl = '';
    server.use(
      http.get(api('/api/leads/board'), ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json(board());
      }),
    );

    const store = usePipelineStore();
    await store.fetchBoard('owner-42');

    expect(new URL(requestedUrl).searchParams.get('ownerId')).toBe('owner-42');
  });

  it('fetchBoard records the error and rethrows on server failure', async () => {
    server.use(
      http.get(api('/api/leads/board'), () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );

    const store = usePipelineStore();
    await expect(store.fetchBoard()).rejects.toThrow('boom');
    expect(store.error).toBe('boom');
    expect(store.loading).toBe(false);
  });

  it('moveLead applies the move optimistically before the PATCH resolves', async () => {
    let sentBody: unknown;
    server.use(
      http.get(api('/api/leads/board'), () => HttpResponse.json(board())),
      http.patch(api('/api/leads/l1'), async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );

    const store = usePipelineStore();
    await store.fetchBoard();

    // Call without awaiting: the optimistic mutation runs synchronously,
    // before the network round-trip.
    const pending = store.moveLead('l1', 'B');

    const a = colById(store.board!, 'A');
    const b = colById(store.board!, 'B');
    expect(a.leads.map((l) => l.id)).toEqual(['l2']); // l1 left A immediately
    expect(b.leads.map((l) => l.id)).toEqual(['l1', 'l3']); // l1 pushed to front of B

    await pending;
    expect(sentBody).toEqual({ stageId: 'B' });
  });

  it('moveLead recomputes count and totalValue for both columns on success', async () => {
    server.use(
      http.get(api('/api/leads/board'), () => HttpResponse.json(board())),
      http.patch(api('/api/leads/l1'), () => HttpResponse.json({ ok: true })),
    );

    const store = usePipelineStore();
    await store.fetchBoard();
    await store.moveLead('l1', 'B');

    const a = colById(store.board!, 'A');
    const b = colById(store.board!, 'B');
    expect(a.count).toBe(1);
    expect(a.totalValue).toBe('200'); // l2 only
    expect(b.count).toBe(2);
    expect(b.totalValue).toBe('150'); // l1(100) + l3(50)

    const toast = useToastStore();
    expect(toast.toasts.some((t) => t.variant === 'success')).toBe(true);
  });

  it('moveLead rolls the board back to the exact pre-move snapshot when the PATCH fails', async () => {
    server.use(
      http.get(api('/api/leads/board'), () => HttpResponse.json(board())),
      http.patch(api('/api/leads/l1'), () =>
        HttpResponse.json({ message: 'nope' }, { status: 500 }),
      ),
    );

    const store = usePipelineStore();
    await store.fetchBoard();

    // The server's reason is surfaced, not a generic "Failed to move lead".
    await expect(store.moveLead('l1', 'B')).rejects.toThrow('nope');

    // Board is byte-for-byte the original: l1 back in A, counts/totals restored.
    expect(store.board).toEqual(board());

    const toast = useToastStore();
    expect(toast.toasts.some((t) => t.variant === 'error' && t.message === 'nope')).toBe(true);
  });
});
