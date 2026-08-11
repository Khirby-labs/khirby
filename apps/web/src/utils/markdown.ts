import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  gfm: true,
  breaks: true,
});

/** http(s), mailto, site-relative paths, and fragment-only links. */
const SAFE_URI = /^(?:(?:(?:https?|mailto):)|\/|#|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i;

/** Render markdown to sanitized HTML for safe `v-html` use. */
export function renderMarkdown(source: string): string {
  const raw = marked.parse(source || '', { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    FORBID_ATTR: ['style'],
    ALLOWED_URI_REGEXP: SAFE_URI,
  });
}
