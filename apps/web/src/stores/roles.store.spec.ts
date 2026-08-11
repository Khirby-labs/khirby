import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setActivePinia, createPinia } from 'pinia';
import { useRolesStore, type Role } from './roles.store';
import { server } from '../test/msw/server';
import { api } from '../test/api-base';

/**
 * Reference pattern for store specs (see .claude/rules/web.md → "Methodology").
 *
 * We do NOT `vi.mock('../api/client')`. Requests flow through the real client
 * (URL building, JSON serialization, error mapping, 204 handling) and are
 * intercepted by MSW at the network boundary. Each test asserts BOTH what the
 * backend received (method, path, body) and how the store reconciled the
 * response — the two things a real regression would break.
 */

const role = (id: string, name: string): Role => ({ id, name, description: null, permissions: [] });

describe('roles.store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('starts empty with no error', () => {
    const store = useRolesStore();
    expect(store.roles).toEqual([]);
    expect(store.loading).toBe(false);
    expect(store.error).toBe('');
  });

  it('fetchRoles GETs /api/roles, loads the list and clears error', async () => {
    const data = [role('1', 'Admin'), role('2', 'Editor')];
    server.use(http.get(api('/api/roles'), () => HttpResponse.json(data)));

    const store = useRolesStore();
    store.error = 'stale';
    const result = await store.fetchRoles();

    expect(store.roles).toEqual(data);
    expect(result).toEqual(data);
    expect(store.error).toBe('');
    expect(store.loading).toBe(false);
  });

  it('fetchRoles records the server error message and rethrows on failure', async () => {
    server.use(
      http.get(api('/api/roles'), () =>
        HttpResponse.json({ message: 'Forbidden resource' }, { status: 403 }),
      ),
    );

    const store = useRolesStore();
    await expect(store.fetchRoles()).rejects.toThrow('Forbidden resource');
    expect(store.error).toBe('Forbidden resource');
    expect(store.loading).toBe(false);
  });

  it('createRole POSTs { name } and appends the created role', async () => {
    const created = role('3', 'Viewer');
    let sentBody: unknown;
    server.use(
      http.post(api('/api/roles'), async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    const store = useRolesStore();
    store.roles = [role('1', 'Admin')];
    const result = await store.createRole('Viewer');

    expect(sentBody).toEqual({ name: 'Viewer' });
    expect(result).toEqual(created);
    expect(store.roles.map((r) => r.id)).toEqual(['1', '3']);
  });

  it('updateRole PATCHes /api/roles/:id and replaces the matching entry', async () => {
    const updated = { ...role('1', 'Renamed'), description: 'desc' };
    let sentBody: unknown;
    server.use(
      http.patch(api('/api/roles/1'), async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(updated);
      }),
    );

    const store = useRolesStore();
    store.roles = [role('1', 'Admin'), role('2', 'Editor')];
    const result = await store.updateRole('1', { name: 'Renamed', description: 'desc' });

    expect(sentBody).toEqual({ name: 'Renamed', description: 'desc' });
    expect(result).toEqual(updated);
    expect(store.roles[0]).toEqual(updated);
    expect(store.roles[1].name).toBe('Editor');
  });

  it('setPermissions PUTs { permissions } and stores the persisted rows', async () => {
    const perms = [{ resource: 'contacts', action: 'view' }];
    let sentBody: unknown;
    server.use(
      http.put(api('/api/roles/1/permissions'), async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(perms);
      }),
    );

    const store = useRolesStore();
    store.roles = [role('1', 'Admin')];
    const result = await store.setPermissions('1', perms);

    expect(sentBody).toEqual({ permissions: perms });
    expect(result).toEqual(perms);
    expect(store.roles[0].permissions).toEqual(perms);
  });

  it('deleteRole DELETEs /api/roles/:id (204) and removes it from the list', async () => {
    let hit = false;
    server.use(
      http.delete(api('/api/roles/1'), () => {
        hit = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const store = useRolesStore();
    store.roles = [role('1', 'Admin'), role('2', 'Editor')];
    await store.deleteRole('1');

    expect(hit).toBe(true);
    expect(store.roles.map((r) => r.id)).toEqual(['2']);
  });
});
