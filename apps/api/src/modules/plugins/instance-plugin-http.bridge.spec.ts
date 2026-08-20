import 'reflect-metadata';
import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RequirePluginEnabled, PLUGIN_REGISTRY } from '../../../../../packages/plugin-host/src';
import { InstancePluginHttpBridge } from './instance-plugin-http.bridge';

@Injectable()
class StatsService {
  stats() {
    return { stats: [{ label: 'Leads', value: 3 }] };
  }
}

@Controller('plugins/demo-page')
@RequirePluginEnabled('crm_demo_page')
class DemoController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  index() {
    return this.stats.stats();
  }
}

@Module({ controllers: [DemoController], providers: [StatsService] })
class DemoNestModule {}

describe('InstancePluginHttpBridge', () => {
  it('registers and dispatches GET handlers from a lazy-loaded module', async () => {
    const registry = {
      isEnabled: jest.fn().mockReturnValue(true),
      findByName: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [DemoNestModule],
      providers: [InstancePluginHttpBridge, { provide: PLUGIN_REGISTRY, useValue: registry }],
    }).compile();

    await moduleRef.init();

    const bridge = moduleRef.get(InstancePluginHttpBridge);
    const paths = bridge.registerModuleRoutes(DemoNestModule);

    expect(paths).toEqual(['/api/plugins/demo-page']);
    await expect(bridge.dispatch('GET', 'plugins/demo-page')).resolves.toEqual({
      stats: [{ label: 'Leads', value: 3 }],
    });
    expect(registry.isEnabled).toHaveBeenCalledWith('crm_demo_page');
  });

  it('reads plugin name from controller metadata', async () => {
    const registry = { isEnabled: jest.fn().mockReturnValue(false), findByName: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      imports: [DemoNestModule],
      providers: [InstancePluginHttpBridge, { provide: PLUGIN_REGISTRY, useValue: registry }],
    }).compile();
    await moduleRef.init();

    const bridge = moduleRef.get(InstancePluginHttpBridge);
    bridge.registerModuleRoutes(DemoNestModule);

    await expect(bridge.dispatch('GET', 'plugins/demo-page')).rejects.toMatchObject({
      response: expect.objectContaining({ code: expect.any(String) }),
    });
  });
});
