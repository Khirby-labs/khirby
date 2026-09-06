/**
 * Browser-side CSV parse for Contacts → Import.
 * Detects `,` vs `;` from the header row, strips a UTF-8 BOM, and accepts CRLF.
 */

export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

export function parseCsv(input: string): ParsedCsv {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!text.trim()) return { headers: [], rows: [] };

  const firstNl = text.indexOf('\n');
  const headerLine = firstNl === -1 ? text : text.slice(0, firstNl);
  const delim = detectDelimiter(headerLine);
  const records = splitRecords(text, delim);
  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map((h) => h.trim());
  if (headers.every((h) => !h)) return { headers: [], rows: [] };

  const rows: Record<string, string>[] = [];
  for (const cells of records.slice(1)) {
    if (cells.every((c) => !c.trim())) continue;
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = cells[i] ?? '';
    });
    rows.push(row);
  }
  return { headers, rows };
}

function detectDelimiter(headerLine: string): string {
  let semi = 0;
  let comma = 0;
  let inQuotes = false;
  for (let i = 0; i < headerLine.length; i++) {
    const ch = headerLine[i];
    if (ch === '"') {
      if (inQuotes && headerLine[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === ';') semi += 1;
    if (ch === ',') comma += 1;
  }
  return semi > comma ? ';' : ',';
}

function splitRecords(text: string, delim: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    pushCell();
    records.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delim) {
      pushCell();
      continue;
    }
    if (ch === '\n') {
      pushRow();
      continue;
    }
    cell += ch;
  }
  if (inQuotes || cell.length > 0 || row.length > 0) pushRow();
  return records;
}
