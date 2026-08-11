import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renders plain markdown', () => {
    const html = renderMarkdown('**bold**');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('allows https links', () => {
    const html = renderMarkdown('[safe](https://example.com)');
    expect(html).toContain('href="https://example.com"');
  });

  it('strips javascript: href', () => {
    const html = renderMarkdown('[x](javascript:alert(1))');
    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('strips data: href', () => {
    const html = renderMarkdown('[x](data:text/html,hi)');
    expect(html.toLowerCase()).not.toContain('data:');
  });

  it('strips style attributes', () => {
    // marked won't emit style; inject via a crafted HTML-looking payload after parse
    // by using a raw HTML block that marked may pass through in some configs.
    const html = renderMarkdown('<p style="color:red">x</p>');
    expect(html).not.toContain('style=');
  });
});
