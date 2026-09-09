import { describe, it, expect } from 'vitest';
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
});
