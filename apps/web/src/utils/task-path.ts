import { slugifyName } from './form-field-templates';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Leading KEY-NN from a path segment (e.g. FIN-01-fix-login → FIN-01). */
const IDENTIFIER_PREFIX_RE = /^([A-Za-z0-9]{1,10}-\d+)/;

export type TaskPathFields = {
  identifier: string;
  title: string;
};

/** Path segment after /boards/tasks/ — identifier + title slug (Linear-style). */
export function boardsTaskRef(task: TaskPathFields): string {
  const id = task.identifier.trim();
  const slug = slugifyName(task.title);
  if (!slug) return id;
  return `${id}-${slug}`;
}

export function boardsTaskLocation(task: TaskPathFields) {
  return { name: 'boards-task' as const, params: { taskId: boardsTaskRef(task) } };
}

export function parseTaskRef(ref: string): { kind: 'uuid' | 'identifier'; value: string } {
  const trimmed = ref.trim();
  if (UUID_RE.test(trimmed)) return { kind: 'uuid', value: trimmed };
  const match = trimmed.match(IDENTIFIER_PREFIX_RE);
  if (match?.[1]) return { kind: 'identifier', value: match[1].toUpperCase() };
  return { kind: 'identifier', value: trimmed.toUpperCase() };
}
