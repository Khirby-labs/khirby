import { PluginEnabledGuard } from '../../../../../packages/plugin-host/src/plugin-enabled.guard';
import { PLUGIN_NAME_KEY } from '../../../../../packages/plugin-host/src/tokens';
import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';

function makeContext(): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({}) }),
  } as unknown as ExecutionContext;
}

describe('PluginEnabledGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let registry: { isEnabled: jest.Mock; findByName: jest.Mock };
  let guard: PluginEnabledGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    registry = { isEnabled: jest.fn(), findByName: jest.fn() };
    guard = new PluginEnabledGuard(reflector as any, registry as any);
  });

  it('allows when no plugin metadata is set', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  it('allows when registry.isEnabled returns true', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === PLUGIN_NAME_KEY ? 'crm_demo' : undefined,
    );
    registry.isEnabled.mockReturnValue(true);
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  it('throws when the plugin is disabled', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === PLUGIN_NAME_KEY ? 'crm_demo' : undefined,
    );
    registry.isEnabled.mockReturnValue(false);
    await expect(guard.canActivate(makeContext())).rejects.toThrow(ServiceUnavailableException);
  });
});
