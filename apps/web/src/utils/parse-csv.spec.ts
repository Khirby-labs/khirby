import { describe, it, expect } from 'vitest';
import { parseCsv } from './parse-csv';

describe('parseCsv', () => {
  it('parses a Polish Excel export with semicolon, BOM and CRLF', () => {
    const csv = '\uFEFFE-mail;Imię;MRR\r\nada@example.com;Ada;1200\r\n';
    const parsed = parseCsv(csv);
    expect(parsed.headers).toEqual(['E-mail', 'Imię', 'MRR']);
    expect(parsed.rows).toEqual([{ 'E-mail': 'ada@example.com', Imię: 'Ada', MRR: '1200' }]);
  });

  it('keeps a quoted comma as one column', () => {
    const parsed = parseCsv('email,name\n"a@b.com","Lovelace, Ada"\n');
    expect(parsed.headers).toEqual(['email', 'name']);
    expect(parsed.rows[0]).toEqual({ email: 'a@b.com', name: 'Lovelace, Ada' });
  });

  it('returns no headers when the file is empty', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
  });
});
