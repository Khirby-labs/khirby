import { formatSpaPageHint, spaPathFromSummary } from './plugin-page-hint';

describe('plugin-page-hint', () => {
  it('formats none when there are no pages', () => {
    expect(formatSpaPageHint([])).toBe('SPA page: none');
  });

  it('formats the live /plugins/ path and label', () => {
    expect(formatSpaPageHint([{ path: '/plugins/hello-stats', navLabel: 'Hello Stats' }])).toBe(
      'SPA page: /plugins/hello-stats (Hello Stats)',
    );
  });

  it('parses the first path from a tool summary', () => {
    expect(
      spaPathFromSummary(
        'Scaffolded and installed crm_x (installed) — live. SPA page: /plugins/hello-stats (Hello Stats)',
      ),
    ).toBe('/plugins/hello-stats');
  });

  it('returns null when the summary says none', () => {
    expect(spaPathFromSummary('Installed crm_x (installed). SPA page: none')).toBeNull();
  });
});
