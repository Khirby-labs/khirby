import {
  deriveProjectKey,
  formatTaskIdentifier,
  normalizeProjectKey,
  parseTaskRef,
} from './task-key';

describe('task-key', () => {
  it('formats identifiers with at least two digits', () => {
    expect(formatTaskIdentifier('FIN', 1)).toBe('FIN-01');
    expect(formatTaskIdentifier('BEAR', 12)).toBe('BEAR-12');
    expect(formatTaskIdentifier('X', 100)).toBe('X-100');
  });

  it('normalizes keys to A–Z / 0–9', () => {
    expect(normalizeProjectKey(' fin-ops ')).toBe('FINOPS');
    expect(normalizeProjectKey('bear!')).toBe('BEAR');
  });

  it('derives a key from the project name', () => {
    expect(deriveProjectKey('Finance')).toBe('FINANC');
    expect(deriveProjectKey('A')).toBe('PRJ');
  });

  it('parses UUID and KEY-NN-slug refs', () => {
    expect(parseTaskRef('d172cf4e-e708-4038-9fd6-8b385fd018ac').kind).toBe('uuid');
    expect(parseTaskRef('FIN-01-fix-login')).toEqual({ kind: 'identifier', value: 'FIN-01' });
    expect(parseTaskRef('mcp-3')).toEqual({ kind: 'identifier', value: 'MCP-3' });
  });
});
