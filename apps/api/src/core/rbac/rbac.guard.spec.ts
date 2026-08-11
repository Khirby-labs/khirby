import { PermissionGuard } from './rbac.guard';
import { RbacService } from './rbac.service';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PERMISSION_KEY, SUPER_ADMIN_KEY } from './require-permission.decorator';

function makeContext(session: any): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ session }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let rbac: jest.Mocked<Pick<RbacService, 'hasPermission' | 'isSuperAdmin'>>;
  let guard: PermissionGuard;

  // Resolve metadata by key so super-admin and permission lookups are independent.
  function setMetadata(meta: { superAdmin?: boolean; permission?: unknown }) {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === SUPER_ADMIN_KEY) return meta.superAdmin;
      if (key === PERMISSION_KEY) return meta.permission;
      return undefined;
    });
  }

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    rbac = { hasPermission: jest.fn(), isSuperAdmin: jest.fn() };
    guard = new PermissionGuard(reflector as any, rbac as any);
  });

  it('allows the request when no metadata is present', async () => {
    setMetadata({});
    const result = await guard.canActivate(makeContext({ userId: 'u1' }));
    expect(result).toBe(true);
    expect(rbac.hasPermission).not.toHaveBeenCalled();
    expect(rbac.isSuperAdmin).not.toHaveBeenCalled();
  });

  it('denies the request when there is no session userId', async () => {
    setMetadata({ permission: { resource: 'roles', action: 'manage' } });
    const result = await guard.canActivate(makeContext({}));
    expect(result).toBe(false);
    expect(rbac.hasPermission).not.toHaveBeenCalled();
  });

  it('delegates to RbacService.hasPermission and returns its result', async () => {
    setMetadata({ permission: { resource: 'roles', action: 'manage' } });
    rbac.hasPermission.mockResolvedValue(true);
    const result = await guard.canActivate(makeContext({ userId: 'u1' }));
    expect(result).toBe(true);
    expect(rbac.hasPermission).toHaveBeenCalledWith('u1', 'roles', 'manage');
  });

  it('returns false when RbacService.hasPermission denies', async () => {
    setMetadata({ permission: { resource: 'roles', action: 'manage' } });
    rbac.hasPermission.mockResolvedValue(false);
    const result = await guard.canActivate(makeContext({ userId: 'u1' }));
    expect(result).toBe(false);
  });

  describe('@RequireSuperAdmin', () => {
    it('throws ForbiddenException for a non-super-admin', async () => {
      setMetadata({ superAdmin: true, permission: { resource: 'roles', action: 'manage' } });
      rbac.isSuperAdmin.mockResolvedValue(false);
      await expect(guard.canActivate(makeContext({ userId: 'u1' }))).rejects.toThrow(
        ForbiddenException,
      );
      expect(rbac.hasPermission).not.toHaveBeenCalled();
    });

    it('passes for a super-admin who also holds the permission', async () => {
      setMetadata({ superAdmin: true, permission: { resource: 'roles', action: 'manage' } });
      rbac.isSuperAdmin.mockResolvedValue(true);
      rbac.hasPermission.mockResolvedValue(true);
      const result = await guard.canActivate(makeContext({ userId: 'u1' }));
      expect(result).toBe(true);
      expect(rbac.isSuperAdmin).toHaveBeenCalledWith('u1');
    });

    it('denies when there is no session userId, without checking super-admin', async () => {
      setMetadata({ superAdmin: true });
      const result = await guard.canActivate(makeContext({}));
      expect(result).toBe(false);
      expect(rbac.isSuperAdmin).not.toHaveBeenCalled();
    });
  });
});
