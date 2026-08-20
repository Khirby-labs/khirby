import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRoleDto, UpdateRoleDto, SetPermissionsDto } from './role.dto';

async function errorsFor<T extends object>(cls: new () => T, payload: any) {
  const instance = plainToInstance(cls, payload);
  return { instance, errors: await validate(instance as object) };
}

describe('CreateRoleDto', () => {
  it('accepts a valid name and trims it', async () => {
    const { instance, errors } = await errorsFor(CreateRoleDto, { name: '  Editor  ' });
    expect(errors).toHaveLength(0);
    expect(instance.name).toBe('Editor');
  });

  it('rejects a blank-after-trim name', async () => {
    const { errors } = await errorsFor(CreateRoleDto, { name: '   ' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a name longer than 100 chars', async () => {
    const { errors } = await errorsFor(CreateRoleDto, { name: 'x'.repeat(101) });
    expect(errors.some((e) => e.constraints?.maxLength)).toBe(true);
  });

  it('rejects a description longer than 500 chars', async () => {
    const { errors } = await errorsFor(CreateRoleDto, { name: 'ok', description: 'x'.repeat(501) });
    expect(errors.some((e) => e.constraints?.maxLength)).toBe(true);
  });
});

describe('UpdateRoleDto', () => {
  it('allows an omitted name', async () => {
    const { errors } = await errorsFor(UpdateRoleDto, { description: 'just a description' });
    expect(errors).toHaveLength(0);
  });

  it('rejects a blank-after-trim name when provided', async () => {
    const { errors } = await errorsFor(UpdateRoleDto, { name: '   ' });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('SetPermissionsDto', () => {
  it('accepts permissions from the canonical catalog', async () => {
    const { errors } = await errorsFor(SetPermissionsDto, {
      permissions: [{ resource: 'roles', action: 'manage' }],
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts agent use and manage pairs', async () => {
    const { errors } = await errorsFor(SetPermissionsDto, {
      permissions: [
        { resource: 'agent', action: 'use' },
        { resource: 'agent', action: 'manage' },
      ],
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects an unknown resource', async () => {
    const { errors } = await errorsFor(SetPermissionsDto, {
      permissions: [{ resource: 'bogus', action: 'manage' }],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects contacts:use — use is only valid for agent', async () => {
    const { errors } = await errorsFor(SetPermissionsDto, {
      permissions: [{ resource: 'contacts', action: 'use' }],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an unknown action', async () => {
    const { errors } = await errorsFor(SetPermissionsDto, {
      permissions: [{ resource: 'roles', action: 'delete' }],
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});
