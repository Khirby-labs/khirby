import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';
import { SessionGuard } from '../../core/auth/session.guard';
import { PermissionGuard } from '../../core/rbac/rbac.guard';
import { PERMISSION_KEY } from '../../core/rbac/require-permission.decorator';

/**
 * Guard wiring is asserted through metadata (the `roles.controller.spec.ts`
 * pattern) rather than by driving HTTP: that is what pins the 401/403 behaviour to
 * this controller without standing up sessions and RBAC. The guards themselves are
 * stubbed so DI need not resolve their dependencies.
 */
describe('MarketplaceController', () => {
  let controller: MarketplaceController;
  let moduleRef: TestingModule;
  let service: jest.Mocked<MarketplaceService>;

  beforeEach(async () => {
    const serviceMock: Partial<jest.Mocked<MarketplaceService>> = {
      list: jest.fn(),
      findOne: jest.fn(),
      install: jest.fn(),
    };

    moduleRef = await Test.createTestingModule({
      controllers: [MarketplaceController],
      providers: [{ provide: MarketplaceService, useValue: serviceMock }],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(MarketplaceController);
    service = moduleRef.get(MarketplaceService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  describe('guard wiring', () => {
    /*
     * Order is the assertion, not just presence: PermissionGuard reads
     * req.session.userId, so running it before SessionGuard would answer 403 for an
     * anonymous caller where the contract says 401.
     */
    it('applies SessionGuard first, then PermissionGuard', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, MarketplaceController) ?? [];
      expect(guards[0]).toBe(SessionGuard);
      expect(guards).toContain(PermissionGuard);
    });

    it('gates the whole controller with @RequirePermission(integrations, manage)', () => {
      const perm = Reflect.getMetadata(PERMISSION_KEY, MarketplaceController);
      expect(perm).toEqual({ resource: 'integrations', action: 'manage' });
    });

    /*
     * The Marketplace deliberately introduces NO permission resource of its own —
     * it shares the one PluginsController uses. A `marketplace` resource appearing
     * here would mean a second privilege to keep in sync.
     */
    it('introduces no new permission resource', () => {
      const perm = Reflect.getMetadata(PERMISSION_KEY, MarketplaceController);
      expect(perm.resource).not.toBe('marketplace');
    });
  });

  describe('delegation', () => {
    it('list delegates to the service', async () => {
      const out = [{ name: 'crm_a' }] as any;
      service.list.mockResolvedValue(out);
      await expect(controller.list()).resolves.toBe(out);
    });

    it('findOne passes the plugin name through', async () => {
      const out = { name: 'crm_a' } as any;
      service.findOne.mockResolvedValue(out);
      await expect(controller.findOne('crm_a')).resolves.toBe(out);
      expect(service.findOne).toHaveBeenCalledWith('crm_a');
    });

    it('install passes the plugin name through', async () => {
      const out = { name: 'crm_a', enabled: true } as any;
      service.install.mockResolvedValue(out);
      await expect(controller.install('crm_a')).resolves.toBe(out);
      expect(service.install).toHaveBeenCalledWith('crm_a');
    });
  });

  describe('failure codes reaching the client', () => {
    it('surfaces 404 for a name outside the catalog', async () => {
      service.findOne.mockRejectedValue(new NotFoundException());
      await expect(controller.findOne('crm_nope')).rejects.toThrow(NotFoundException);
    });

    it('surfaces 404 when installing something not in the catalog or the image', async () => {
      service.install.mockRejectedValue(new NotFoundException());
      await expect(controller.install('crm_nope')).rejects.toThrow(NotFoundException);
    });

    it('surfaces 409 when installing an already-installed plugin', async () => {
      service.install.mockRejectedValue(new ConflictException());
      await expect(controller.install('crm_a')).rejects.toThrow(ConflictException);
    });
  });
});
