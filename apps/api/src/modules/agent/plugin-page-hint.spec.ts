import {
  formatInstalledPluginsSummary,
  formatSpaPageHint,
  spaPathFromSummary,
} from './plugin-page-hint';

describe('plugin-page-hint', () => {
  it('formats none when there are no pages', () => {
    expect(formatSpaPageHint([])).toBe('SPA page: none');
  });

  it('formats the live /plugins/ path and label', () => {
    expect(formatSpaPageHint([{ path: '/plugins/hello-stats', navLabel: 'Hello Stats' }])).toBe(
      'SPA page: /plugins/hello-stats (Hello Stats)',
    );
  });

  it('lists each installed plugin with its SPA page line', () => {
    expect(
      formatInstalledPluginsSummary(['crm_a', 'crm_b'], (name) =>
        name === 'crm_a' ? [{ path: '/plugins/a', navLabel: 'A' }] : [],
      ),
    ).toBe('crm_a | SPA page: /plugins/a (A)\ncrm_b | SPA page: none');
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
