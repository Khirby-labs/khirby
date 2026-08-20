import type { CrmPlugin } from '@khirby/plugin-sdk';
import { assertInstancePluginShape } from './instance-plugin-validate';

function makePlugin(partial: Partial<CrmPlugin> & Pick<CrmPlugin, 'name'>): CrmPlugin {
  return {
    displayName: 'Demo',
    version: '0.1.0',
    ...partial,
  };
}

describe('assertInstancePluginShape', () => {
  it('accepts a nest plugin with matching route slug', () => {
    expect(() =>
      assertInstancePluginShape(
        makePlugin({
          name: 'crm_hello_stats',
          getNestModule: () => class {},
          getFrontendRoutes: () => [
            {
              path: '/plugins/hello-stats',
              name: 'plugin-hello-stats',
              navLabel: 'Hello Stats',
              navIcon: 'plugins',
              component: async () => null,
            },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it('rejects frontend routes without getNestModule', () => {
    expect(() =>
      assertInstancePluginShape(
        makePlugin({
          name: 'crm_broken',
          getFrontendRoutes: () => [
            {
              path: '/plugins/broken',
              name: 'plugin-broken',
              navLabel: 'Broken',
              navIcon: 'plugins',
              component: async () => null,
            },
          ],
        }),
      ),
    ).toThrow(/getNestModule/);
  });

  it('rejects routes without navLabel', () => {
    expect(() =>
      assertInstancePluginShape(
        makePlugin({
          name: 'crm_no_label',
          getNestModule: () => class {},
          getFrontendRoutes: () => [
            {
              path: '/plugins/no-label',
              name: 'plugin-no-label',
              navIcon: 'plugins',
              component: async () => null,
            } as any,
          ],
        }),
      ),
    ).toThrow(/navLabel/);
  });

  it('rejects slug mismatch between name and route path', () => {
    expect(() =>
      assertInstancePluginShape(
        makePlugin({
          name: 'crm_hello_world',
          getNestModule: () => class {},
          getFrontendRoutes: () => [
            {
              path: '/plugins/hello-stats',
              name: 'plugin-hello-stats',
              navLabel: 'Hello',
              navIcon: 'plugins',
              component: async () => null,
            },
          ],
        }),
      ),
    ).toThrow(/hello-world/);
  });
});
