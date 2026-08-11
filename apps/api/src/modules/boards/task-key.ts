/** Format a human task id, e.g. FIN-01 / BEAR-12 */
export function formatTaskIdentifier(projectKey: string, number: number): string {
  return `${projectKey}-${String(number).padStart(2, '0')}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Leading KEY-NN from a path/API ref (e.g. FIN-01-fix-login → FIN-01). */
const IDENTIFIER_PREFIX_RE = /^([A-Za-z0-9]{1,10}-\d+)/;

/** Resolve a URL/API ref: UUID, bare KEY-NN, or KEY-NN-title-slug. */
export function parseTaskRef(ref: string): { kind: 'uuid' | 'identifier'; value: string } {
  const trimmed = ref.trim();
  if (UUID_RE.test(trimmed)) return { kind: 'uuid', value: trimmed };
  const match = trimmed.match(IDENTIFIER_PREFIX_RE);
  if (match?.[1]) return { kind: 'identifier', value: match[1].toUpperCase() };
  return { kind: 'identifier', value: trimmed.toUpperCase() };
}

/** Normalize user/input key to A–Z / 0–9, length 2–10. */
export function normalizeProjectKey(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
}

/** Derive a default key from a project name (e.g. "Finance Ops" → FINANCE → FINANC). */
export function deriveProjectKey(name: string): string {
  const compact = normalizeProjectKey(name);
  if (compact.length >= 2) return compact.slice(0, 6);

  const initials = name
    .split(/[\s_-]+/)
    .map((w) => w[0] ?? '')
    .join('');
  const fromInitials = normalizeProjectKey(initials);
  if (fromInitials.length >= 2) return fromInitials.slice(0, 6);
  return 'PRJ';
}
