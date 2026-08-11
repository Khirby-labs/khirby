import { Test } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { SessionGuard } from '../../core/auth/session.guard';
import { PermissionGuard } from '../../core/rbac/rbac.guard';
import { PERMISSION_KEY, SUPER_ADMIN_KEY } from '../../core/rbac/require-permission.decorator';

describe('RolesController', () => {
  let controller: RolesController;
  let service: jest.Mocked<RolesService>;

  beforeEach(async () => {
    const serviceMock: Partial<jest.Mocked<RolesService>> = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      setPermissions: jest.fn(),
      assignToUser: jest.fn(),
      removeFromUser: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [{ provide: RolesService, useValue: serviceMock }],
    })
      // Guards are asserted via metadata below; stub them so DI need not resolve their deps.
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(RolesController);
    service = moduleRef.get(RolesService);
  });

  describe('guard wiring', () => {
    it('applies SessionGuard first, then PermissionGuard', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, RolesController) ?? [];
      expect(guards[0]).toBe(SessionGuard);
      expect(guards).toContain(PermissionGuard);
    });

    it('gates reads with @RequirePermission(roles, manage) at class level', () => {
      const perm = Reflect.getMetadata(PERMISSION_KEY, RolesController);
      expect(perm).toEqual({ resource: 'roles', action: 'manage' });
    });

    it('marks every mutation handler with @RequireSuperAdmin', () => {
      const mutations = [
        'create',
        'update',
        'delete',
        'setPermissions',
        'assignToUser',
        'removeFromUser',
      ];
      for (const name of mutations) {
        const meta = Reflect.getMetadata(SUPER_ADMIN_KEY, (RolesController.prototype as any)[name]);
        expect(meta).toBe(true);
      }
    });

    it('does not mark read handlers with @RequireSuperAdmin', () => {
      for (const name of ['findAll', 'findById']) {
        const meta = Reflect.getMetadata(SUPER_ADMIN_KEY, (RolesController.prototype as any)[name]);
        expect(meta).toBeUndefined();
      }
    });
  });

  describe('delegation', () => {
    it('findAll delegates to the service', () => {
      const out = [{ id: 'r1' }] as any;
      service.findAll.mockReturnValue(out);
      expect(controller.findAll()).toBe(out);
      expect(service.findAll).toHaveBeenCalledWith();
    });

    it('findById passes the id through', () => {
      const out = { id: 'r1' } as any;
      service.findById.mockReturnValue(out);
      expect(controller.findById('r1')).toBe(out);
      expect(service.findById).toHaveBeenCalledWith('r1');
    });

    it('create forwards the dto', () => {
      const dto = { name: 'editor' } as any;
      const out = { id: 'r1' } as any;
      service.create.mockReturnValue(out);
      expect(controller.create(dto)).toBe(out);
      expect(service.create).toHaveBeenCalledWith(dto);
    });

    it('update forwards id and dto', () => {
      const dto = { name: 'x' } as any;
      const out = { id: 'r1' } as any;
      service.update.mockReturnValue(out);
      expect(controller.update('r1', dto)).toBe(out);
      expect(service.update).toHaveBeenCalledWith('r1', dto);
    });

    it('delete forwards the id', () => {
      service.delete.mockReturnValue(undefined as any);
      controller.delete('r1');
      expect(service.delete).toHaveBeenCalledWith('r1');
    });

    it('setPermissions unwraps the body permissions', () => {
      const out = [{ id: 'p1' }] as any;
      service.setPermissions.mockReturnValue(out);
      const perms = [{ resource: 'forms', action: 'manage' }];
      expect(controller.setPermissions('r1', { permissions: perms } as any)).toBe(out);
      expect(service.setPermissions).toHaveBeenCalledWith('r1', perms);
    });

    it('assignToUser maps (roleId, userId) to service (userId, roleId)', () => {
      service.assignToUser.mockReturnValue(undefined as any);
      controller.assignToUser('r1', 'u1');
      expect(service.assignToUser).toHaveBeenCalledWith('u1', 'r1');
    });

    it('removeFromUser maps (roleId, userId) to service (userId, roleId)', () => {
      service.removeFromUser.mockReturnValue(undefined as any);
      controller.removeFromUser('r1', 'u1');
      expect(service.removeFromUser).toHaveBeenCalledWith('u1', 'r1');
    });
  });
});
