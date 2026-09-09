import 'reflect-metadata';
import { Body, Controller, Get, Injectable, Module, Patch, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RequirePluginEnabled, PLUGIN_REGISTRY } from '../../../../../packages/plugin-host/src';
import { InstancePluginHttpBridge, pathFromRequestUrl } from './instance-plugin-http.bridge';

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

@Controller('plugins/ai-compose')
@RequirePluginEnabled('crm_ai_compose')
class SettingsController {
  @Get('settings')
  getSettings() {
    return { hasApiKey: false };
  }

  @Patch('settings')
  updateSettings(@Body() dto: { baseUrl?: string }) {
    return { saved: true, baseUrl: dto?.baseUrl ?? null };
  }

  @Post('suggest')
  suggest(@Body() dto: { threadId?: string }) {
    return { draft: `reply:${dto?.threadId ?? ''}` };
  }
}

@Module({ controllers: [DemoController], providers: [StatsService] })
class DemoNestModule {}

@Module({ controllers: [SettingsController] })
class SettingsNestModule {}

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

    expect(paths).toEqual(['GET /api/plugins/demo-page']);
    await expect(bridge.dispatch('GET', 'plugins/demo-page')).resolves.toEqual({
      stats: [{ label: 'Leads', value: 3 }],
    });
    expect(registry.isEnabled).toHaveBeenCalledWith('crm_demo_page');
  });

  it('registers nested settings paths and forwards PATCH body', async () => {
    const registry = { isEnabled: jest.fn().mockReturnValue(true), findByName: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      imports: [SettingsNestModule],
      providers: [InstancePluginHttpBridge, { provide: PLUGIN_REGISTRY, useValue: registry }],
    }).compile();
    await moduleRef.init();

    const bridge = moduleRef.get(InstancePluginHttpBridge);
    const paths = bridge.registerModuleRoutes(SettingsNestModule, 'crm_ai_compose');

    expect(paths).toEqual(
      expect.arrayContaining([
        'GET /api/plugins/ai-compose/settings',
        'PATCH /api/plugins/ai-compose/settings',
        'POST /api/plugins/ai-compose/suggest',
      ]),
    );

    await expect(bridge.dispatch('GET', 'plugins/ai-compose/settings')).resolves.toEqual({
      hasApiKey: false,
    });

    await expect(
      bridge.dispatch('PATCH', 'plugins/ai-compose/settings', {
        body: { baseUrl: 'https://api.example' },
        query: {},
        params: {},
        headers: {},
      } as any),
    ).resolves.toEqual({ saved: true, baseUrl: 'https://api.example' });

    await expect(
      bridge.dispatch('POST', 'plugins/ai-compose/suggest', {
        body: { threadId: 't1' },
        query: {},
        params: {},
        headers: {},
      } as any),
    ).resolves.toEqual({ draft: 'reply:t1' });
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

  it('pathFromRequestUrl strips /api and query', () => {
    expect(pathFromRequestUrl('/api/plugins/ai-compose/settings?x=1')).toBe(
      'plugins/ai-compose/settings',
    );
    expect(pathFromRequestUrl('/plugins/mcp/token')).toBe('plugins/mcp/token');
  });
});
