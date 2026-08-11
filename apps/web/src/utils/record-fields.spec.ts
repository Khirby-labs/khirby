import { describe, it, expect } from 'vitest';
import { recordToFieldRows } from './record-fields';

describe('recordToFieldRows', () => {
  it('flattens plain submission fields', () => {
    const rows = recordToFieldRows({
      name: 'Patryk',
      email: 'a@b.com',
      message: 'Hello\nworld',
      _hp: 'bot',
    });
    expect(rows.map((r) => r.key)).toEqual(['name', 'email', 'message']);
    expect(rows.find((r) => r.key === 'message')?.multiline).toBe(true);
  });

  it('flattens nested listmonk metadata and formats dates', () => {
    const rows = recordToFieldRows(
      {
        listmonk: {
          status: 'enabled',
          subscriberId: 42,
          syncedAt: '2026-08-03T22:54:00.000Z',
        },
      },
      {
        skipKeys: ['interests'],
        formatDate: () => 'formatted',
      },
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        { key: 'listmonk.status', label: 'listmonk · status', value: 'enabled' },
        { key: 'listmonk.subscriberId', label: 'listmonk · subscriber Id', value: '42' },
        { key: 'listmonk.syncedAt', label: 'listmonk · synced At', value: 'formatted' },
      ]),
    );
  });

  it('skips empty values', () => {
    expect(recordToFieldRows({ a: '', b: null, c: undefined, d: 'ok' })).toEqual([
      { key: 'd', label: 'd', value: 'ok' },
    ]);
  });
});
