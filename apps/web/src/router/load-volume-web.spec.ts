import { describe, it, expect, vi } from 'vitest';
import { loadVolumeWebComponent } from './index';

describe('loadVolumeWebComponent', () => {
  it('resolves webEntry.component from a dynamic module', async () => {
    const code = `export const webEntry = {
      name: 'crm_x',
      component: () => Promise.resolve({ name: 'HotView' }),
    };`;
    const url = `data:text/javascript,${encodeURIComponent(code)}`;
    const component = await loadVolumeWebComponent(url);
    expect(component).toEqual({ name: 'HotView' });
  });

  it('uses default.component when webEntry is absent', async () => {
    const code = `export default {
      name: 'crm_y',
      component: { name: 'StaticView' },
    };`;
    const url = `data:text/javascript,${encodeURIComponent(code)}`;
    const component = await loadVolumeWebComponent(url);
    expect(component).toEqual({ name: 'StaticView' });
  });

  it('fetches /api/ plugin bundles with credentials before import()', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(`export const n = 1;`, {
          status: 200,
          headers: { 'Content-Type': 'text/javascript' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const create = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue(
        `data:text/javascript,${encodeURIComponent(
          `export const webEntry = { name: 'crm_z', component: { name: 'Fetched' } };`,
        )}`,
      );
    try {
      const component = await loadVolumeWebComponent('/api/plugins/crm_z/web/entry.js', '1');
      expect(fetchMock).toHaveBeenCalledWith('/api/plugins/crm_z/web/entry.js?v=1', {
        credentials: 'include',
      });
      expect(create).toHaveBeenCalled();
      expect(component).toEqual({ name: 'Fetched' });
    } finally {
      create.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
