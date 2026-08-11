import { Test } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { SessionGuard } from '../../core/auth/session.guard';
import { PermissionGuard } from '../../core/rbac/rbac.guard';
import { PERMISSION_KEY, SUPER_ADMIN_KEY } from '../../core/rbac/require-permission.decorator';

describe('UsersController', () => {
  let controller: UsersController;
  let service: jest.Mocked<UsersService>;

  beforeEach(async () => {
    const serviceMock: Partial<jest.Mocked<UsersService>> = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      assignRole: jest.fn(),
      removeRole: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: serviceMock }],
    })
      // Guards are asserted via metadata below; stub them so DI need not resolve their deps.
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(UsersController);
    service = moduleRef.get(UsersService);
  });

  describe('guard wiring', () => {
    it('applies SessionGuard first, then PermissionGuard', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, UsersController) ?? [];
      expect(guards[0]).toBe(SessionGuard);
      expect(guards).toContain(PermissionGuard);
    });

    it('gates the controller with @RequirePermission(settings, manage)', () => {
      const perm = Reflect.getMetadata(PERMISSION_KEY, UsersController);
      expect(perm).toEqual({ resource: 'settings', action: 'manage' });
    });

    it('marks role-assignment handlers with @RequireSuperAdmin', () => {
      for (const name of ['assignRole', 'removeRole']) {
        const meta = Reflect.getMetadata(SUPER_ADMIN_KEY, (UsersController.prototype as any)[name]);
        expect(meta).toBe(true);
      }
    });

    it('does not mark plain CRUD handlers with @RequireSuperAdmin', () => {
      for (const name of ['findAll', 'findOne', 'create', 'update', 'delete']) {
        const meta = Reflect.getMetadata(SUPER_ADMIN_KEY, (UsersController.prototype as any)[name]);
        expect(meta).toBeUndefined();
      }
    });
  });

  describe('delegation', () => {
    it('findAll passes the session userId', () => {
      const out = [{ id: 'u1' }] as any;
      service.findAll.mockReturnValue(out);
      const req = { session: { userId: 'me' } } as any;
      expect(controller.findAll(req)).toBe(out);
      expect(service.findAll).toHaveBeenCalledWith('me');
    });

    it('findOne passes the id', () => {
      const out = { id: 'u1' } as any;
      service.findById.mockReturnValue(out);
      expect(controller.findOne('u1')).toBe(out);
      expect(service.findById).toHaveBeenCalledWith('u1');
    });

    it('create forwards the dto', () => {
      const dto = { email: 'a@b.com', password: 'password1' } as any;
      const out = { id: 'u1' } as any;
      service.create.mockReturnValue(out);
      expect(controller.create(dto)).toBe(out);
      expect(service.create).toHaveBeenCalledWith(dto);
    });

    it('update forwards id and dto', () => {
      const dto = { email: 'c@d.com' } as any;
      const out = { id: 'u1' } as any;
      service.update.mockReturnValue(out);
      expect(controller.update('u1', dto)).toBe(out);
      expect(service.update).toHaveBeenCalledWith('u1', dto);
    });

    it('delete forwards id and the session userId', () => {
      const out = { deleted: true } as any;
      service.delete.mockReturnValue(out);
      const req = { session: { userId: 'me' } } as any;
      expect(controller.delete('u1', req)).toBe(out);
      expect(service.delete).toHaveBeenCalledWith('u1', 'me');
    });

    it('assignRole forwards id and roleId', () => {
      const out = { id: 'u1' } as any;
      service.assignRole.mockReturnValue(out);
      expect(controller.assignRole('u1', 'r1')).toBe(out);
      expect(service.assignRole).toHaveBeenCalledWith('u1', 'r1');
    });

    it('removeRole forwards id and roleId', () => {
      const out = { id: 'u1' } as any;
      service.removeRole.mockReturnValue(out);
      expect(controller.removeRole('u1', 'r1')).toBe(out);
      expect(service.removeRole).toHaveBeenCalledWith('u1', 'r1');
    });
  });
});
