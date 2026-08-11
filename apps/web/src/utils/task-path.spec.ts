import { describe, it, expect } from 'vitest';
import { boardsTaskLocation, boardsTaskRef, parseTaskRef } from './task-path';

describe('boardsTaskRef', () => {
  it('joins identifier with a title slug', () => {
    expect(boardsTaskRef({ identifier: 'FIN-01', title: 'Fix login bug' })).toBe(
      'FIN-01-fix-login-bug',
    );
  });

  it('transliterates Polish titles', () => {
    expect(boardsTaskRef({ identifier: 'KHI-02', title: 'Zgłoszenie z Łodzi' })).toBe(
      'KHI-02-zgloszenie-z-lodzi',
    );
  });

  it('falls back to identifier when title has no slug chars', () => {
    expect(boardsTaskRef({ identifier: 'FIN-01', title: '!!!' })).toBe('FIN-01');
  });
});

describe('parseTaskRef', () => {
  it('detects UUIDs', () => {
    expect(parseTaskRef('d172cf4e-e708-4038-9fd6-8b385fd018ac')).toEqual({
      kind: 'uuid',
      value: 'd172cf4e-e708-4038-9fd6-8b385fd018ac',
    });
  });

  it('strips the cosmetic title slug', () => {
    expect(parseTaskRef('FIN-01-fix-login-bug')).toEqual({
      kind: 'identifier',
      value: 'FIN-01',
    });
  });

  it('accepts a bare identifier', () => {
    expect(parseTaskRef('mcp-03')).toEqual({ kind: 'identifier', value: 'MCP-03' });
  });
});

describe('boardsTaskLocation', () => {
  it('builds the named route', () => {
    expect(boardsTaskLocation({ identifier: 'FIN-01', title: 'Hi' })).toEqual({
      name: 'boards-task',
      params: { taskId: 'FIN-01-hi' },
    });
  });
});
