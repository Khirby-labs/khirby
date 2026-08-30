import { describe, it, expect, afterEach } from 'vitest';
import { inAppPathFromClick } from './in-app-path';

function clickPath(
  href: string,
  init: MouseEventInit = {},
  attrs: Record<string, string> = {},
): string | null {
  const root = document.createElement('div');
  const anchor = document.createElement('a');
  anchor.setAttribute('href', href);
  for (const [key, value] of Object.entries(attrs)) {
    anchor.setAttribute(key, value);
  }
  const inner = document.createElement('span');
  inner.textContent = 'tutaj';
  anchor.appendChild(inner);
  root.appendChild(anchor);
  document.body.appendChild(root);

  let result: string | null = null;
  root.addEventListener('click', (event) => {
    result = inAppPathFromClick(event as MouseEvent);
    event.preventDefault();
  });
  inner.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }),
  );
  return result;
}

describe('inAppPathFromClick', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns a site-relative /plugins/ path from a nested click target', () => {
    expect(clickPath('/plugins/hello-stats')).toBe('/plugins/hello-stats');
  });

  it('ignores http(s) links', () => {
    expect(clickPath('https://example.com/x')).toBeNull();
  });

  it('ignores modified clicks and new-tab targets', () => {
    expect(clickPath('/plugins/hello-stats', { ctrlKey: true })).toBeNull();
    expect(clickPath('/plugins/hello-stats', {}, { target: '_blank' })).toBeNull();
  });
});
