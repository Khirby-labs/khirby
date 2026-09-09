import { loadPlugins } from './load-plugins.generated';

describe('loadPlugins (manifest)', () => {
  /*
   * Empty marketplace image: plugins.manifest.json ships no packages. Volume /
   * Marketplace installs are separate from the generated image loader.
   */
  it('loads an empty image plugin set', () => {
    expect(loadPlugins()).toEqual([]);
  });

  it('declares no duplicate plugin names', () => {
    const names = loadPlugins().map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
