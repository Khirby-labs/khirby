export type RecordFieldRow = {
  key: string;
  label: string;
  value: string;
  multiline?: boolean;
};

const SKIP_KEYS = new Set(['_hp']);

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function looksLikeIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

/**
 * Flatten a JSON-ish record into label/value rows for read-only UI
 * (contact metadata, form submission payloads).
 */
export function recordToFieldRows(
  data: Record<string, unknown> | null | undefined,
  options?: {
    skipKeys?: string[];
    formatDate?: (iso: string) => string;
    formatBool?: (value: boolean) => string;
  },
): RecordFieldRow[] {
  if (!data) return [];
  const skip = new Set([...(options?.skipKeys ?? []), ...SKIP_KEYS]);
  const rows: RecordFieldRow[] = [];

  const push = (key: string, label: string, raw: unknown) => {
    if (raw === null || raw === undefined || raw === '') return;

    if (typeof raw === 'boolean') {
      rows.push({
        key,
        label,
        value: options?.formatBool?.(raw) ?? (raw ? 'true' : 'false'),
      });
      return;
    }

    if (typeof raw === 'number') {
      rows.push({ key, label, value: String(raw) });
      return;
    }

    if (typeof raw === 'string') {
      const value = options?.formatDate && looksLikeIsoDate(raw) ? options.formatDate(raw) : raw;
      const row: RecordFieldRow = { key, label, value };
      if (value.includes('\n') || value.length > 120) row.multiline = true;
      rows.push(row);
      return;
    }

    if (Array.isArray(raw)) {
      if (raw.length === 0) return;
      if (
        raw.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item))
      ) {
        rows.push({ key, label, value: raw.map(String).join(', ') });
        return;
      }
      raw.forEach((item, index) => {
        if (isPlainObject(item)) {
          Object.entries(item).forEach(([childKey, childVal]) => {
            if (skip.has(childKey)) return;
            push(`${key}.${index}.${childKey}`, `${label} · ${humanizeKey(childKey)}`, childVal);
          });
        } else if (item != null && item !== '') {
          push(`${key}.${index}`, `${label} (${index + 1})`, item);
        }
      });
      return;
    }

    if (isPlainObject(raw)) {
      Object.entries(raw).forEach(([childKey, childVal]) => {
        if (skip.has(childKey)) return;
        push(`${key}.${childKey}`, `${label} · ${humanizeKey(childKey)}`, childVal);
      });
    }
  };

  Object.entries(data).forEach(([key, value]) => {
    if (skip.has(key)) return;
    push(key, humanizeKey(key), value);
  });

  return rows;
}
