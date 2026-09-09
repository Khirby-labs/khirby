import { extractWebRelPath } from './plugin-web-bundle.controller';

describe('extractWebRelPath', () => {
  it('reads the path after /web/', () => {
    expect(extractWebRelPath('/api/plugins/crm_foo/web/entry.js')).toBe('entry.js');
    expect(extractWebRelPath('/api/plugins/crm_foo/web/assets/chunk.js?v=1')).toBe(
      'assets/chunk.js',
    );
  });

  it('defaults to entry.js when the suffix is empty', () => {
    expect(extractWebRelPath('/api/plugins/crm_foo/web/')).toBe('entry.js');
  });

  it('decodes URI components', () => {
    expect(extractWebRelPath('/api/plugins/crm_foo/web/foo%20bar.js')).toBe('foo bar.js');
  });
});
