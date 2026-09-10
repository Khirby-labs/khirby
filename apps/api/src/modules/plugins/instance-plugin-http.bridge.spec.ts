import 'reflect-metadata';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { Test } from '@nestjs/testing';
import {
  PLUGIN_REGISTRY,
  RBAC_SERVICE,
  RequirePermission,
  RequirePluginEnabled,
} from '../../../../../packages/plugin-host/src';
import {
  InstancePluginHttpBridge,
  matchPath,
  pathFromRequestUrl,
} from './instance-plugin-http.bridge';

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

class CreateCampaignDto {
  @IsString()
  name!: string;
}

@Controller('plugins/listmonk')
class CampaignsController {
  @Post('campaigns')
  @RequirePermission('newsletter', 'manage')
  create(@Body() dto: CreateCampaignDto) {
    return { created: dto.name, extra: (dto as unknown as Record<string, unknown>).evil ?? null };
  }
}

@Module({ controllers: [CampaignsController] })
class CampaignsNestModule {}

@Controller('plugins/demo-items')
class ItemsController {
  @Get('meta')
  meta() {
    return { meta: true };
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return { id };
  }
}

@Module({ controllers: [ItemsController] })
class ItemsNestModule {}

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

  it('enforces plugin @RequirePermission on the reflective dispatcher', async () => {
    const registry = { isEnabled: jest.fn().mockReturnValue(true), findByName: jest.fn() };
    const rbac = {
      hasPermission: jest.fn().mockImplementation(async (_id: string, resource: string) => {
        return resource === 'integrations';
      }),
      isSuperAdmin: jest.fn().mockResolvedValue(false),
    };
    const moduleRef = await Test.createTestingModule({
      imports: [CampaignsNestModule],
      providers: [
        InstancePluginHttpBridge,
        { provide: PLUGIN_REGISTRY, useValue: registry },
        { provide: RBAC_SERVICE, useValue: rbac },
      ],
    }).compile();
    await moduleRef.init();

    const bridge = moduleRef.get(InstancePluginHttpBridge);
    bridge.registerModuleRoutes(CampaignsNestModule, 'crm_listmonk');

    const req = {
      body: { name: 'Spring' },
      query: {},
      params: {},
      headers: {},
      session: { userId: 'u1' },
    } as any;

    await expect(bridge.dispatch('POST', 'plugins/listmonk/campaigns', req)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(rbac.hasPermission).toHaveBeenCalledWith('u1', 'newsletter', 'manage');
  });

  it('runs ValidationPipe whitelist on @Body() DTOs', async () => {
    const registry = { isEnabled: jest.fn().mockReturnValue(true), findByName: jest.fn() };
    const rbac = {
      hasPermission: jest.fn().mockResolvedValue(true),
      isSuperAdmin: jest.fn().mockResolvedValue(false),
    };
    const moduleRef = await Test.createTestingModule({
      imports: [CampaignsNestModule],
      providers: [
        InstancePluginHttpBridge,
        { provide: PLUGIN_REGISTRY, useValue: registry },
        { provide: RBAC_SERVICE, useValue: rbac },
      ],
    }).compile();
    await moduleRef.init();

    const bridge = moduleRef.get(InstancePluginHttpBridge);
    bridge.registerModuleRoutes(CampaignsNestModule, 'crm_listmonk');

    await expect(
      bridge.dispatch('POST', 'plugins/listmonk/campaigns', {
        body: { name: 'Spring', evil: 'extra' },
        query: {},
        params: {},
        headers: {},
        session: { userId: 'u1' },
      } as any),
    ).resolves.toEqual({ created: 'Spring', extra: null });
  });

  it('pathFromRequestUrl strips /api and query', () => {
    expect(pathFromRequestUrl('/api/plugins/ai-compose/settings?x=1')).toBe(
      'plugins/ai-compose/settings',
    );
    expect(pathFromRequestUrl('/plugins/mcp/token')).toBe('plugins/mcp/token');
  });

  it('dispatches @Get(":id") and prefers a static sibling over the param', async () => {
    const registry = { isEnabled: jest.fn().mockReturnValue(true), findByName: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      imports: [ItemsNestModule],
      providers: [InstancePluginHttpBridge, { provide: PLUGIN_REGISTRY, useValue: registry }],
    }).compile();
    await moduleRef.init();

    const bridge = moduleRef.get(InstancePluginHttpBridge);
    bridge.registerModuleRoutes(ItemsNestModule, 'crm_demo_items');

    await expect(bridge.dispatch('GET', 'plugins/demo-items/123')).resolves.toEqual({ id: '123' });
    await expect(bridge.dispatch('GET', 'plugins/demo-items/meta')).resolves.toEqual({
      meta: true,
    });
  });
});

describe('matchPath', () => {
  it('captures :id segments and rejects length mismatches', () => {
    expect(matchPath('plugins/foo/items/:id', 'plugins/foo/items/123')).toEqual({ id: '123' });
    expect(matchPath('plugins/foo/items/:id', 'plugins/foo/items')).toBeNull();
    expect(matchPath('plugins/foo/settings', 'plugins/foo/settings')).toEqual({});
    expect(matchPath('plugins/foo/items/:id', 'plugins/foo/items/%E0%A4%A')).toBeNull();
  });
});
