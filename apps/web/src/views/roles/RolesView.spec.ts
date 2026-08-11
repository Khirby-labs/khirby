import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia } from 'pinia';
import RolesView from './RolesView.vue';
import { server } from '../../test/msw/server';
import { api } from '../../test/api-base';
import { mountWithI18n } from '../../test/i18n';

/**
 * Component test (see .claude/rules/web.md → "Methodology"). Migrated from a
 * vi.mock('../../api/client') spec: requests now flow through the real roles
 * store + api client and are intercepted at the network boundary by MSW, so a
 * regression in URL/body/serialization shows up here — not just a mirror of the
 * store call. Reka's dialog/select/checkbox are stubbed to plain controls so the
 * form and the permission matrix are queryable.
 */

// RolesView registers onBeforeRouteLeave — there is no router in the harness.
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn() }));

const AppModalStub = { template: '<div class="modal-stub"><slot /></div>' };
const AppSelectStub = {
  props: ['modelValue', 'options'],
  emits: ['update:modelValue'],
  template: `<select class="copy-select" :value="modelValue"
    @change="$emit('update:modelValue', $event.target.value)">
    <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
  </select>`,
};
const AppCheckboxStub = {
  props: ['modelValue', 'ariaLabel'],
  emits: ['update:modelValue'],
  template: `<label><input type="checkbox" :aria-label="ariaLabel" :checked="modelValue"
    @change="$emit('update:modelValue', $event.target.checked)" /><slot /></label>`,
};

function mountView(): VueWrapper {
  return mountWithI18n(RolesView, {
    global: {
      plugins: [createPinia()],
      stubs: { AppModal: AppModalStub, AppSelect: AppSelectStub, AppCheckbox: AppCheckboxStub },
    },
  });
}

const newRoleButton = (wrapper: VueWrapper) =>
  wrapper.findAll('button').find((b) => b.attributes('aria-label') === 'New role')!;
const saveChangesButton = (wrapper: VueWrapper) =>
  wrapper.findAll('button').find((b) => b.text() === 'Save changes')!;

const rolesRoute = (list: unknown[]) => http.get(api('/api/roles'), () => HttpResponse.json(list));

afterEach(() => {
  vi.clearAllMocks();
});

describe('RolesView — permission matrix', () => {
  beforeEach(() => {
    server.use(
      rolesRoute([
        { id: 'r1', name: 'Admin', permissions: [{ resource: 'contacts', action: 'manage' }] },
      ]),
    );
  });

  it("reflects the selected role's granted modules and keeps Save disabled until dirty", async () => {
    const wrapper = mountView();
    await flushPromises();

    // The aria-label carries the module's translated LABEL; the raw resource token
    // (contacts/leads) stays the value that drives the request.
    const contacts = wrapper.find('input[aria-label="Grant access to Contacts"]');
    const leads = wrapper.find('input[aria-label="Grant access to Leads"]');
    expect((contacts.element as HTMLInputElement).checked).toBe(true);
    expect((leads.element as HTMLInputElement).checked).toBe(false);

    // Nothing changed yet → Save is disabled.
    expect(saveChangesButton(wrapper).attributes('disabled')).toBeDefined();
  });

  it('renders resolved copy for the counted heading and the module fraction', async () => {
    const wrapper = mountView();
    await flushPromises();

    // Plural + fraction messages, each a single key — a missing one would show
    // the key path here instead of copy. One role in the fixture, so English
    // takes its singular form; the module fraction counts all nine modules.
    expect(wrapper.text()).toContain('Role (1)');
    expect(wrapper.text()).toContain('1/9 modules');
  });

  it('PUTs the updated module set when a module is toggled and saved', async () => {
    let sentBody: unknown;
    server.use(
      http.put(api('/api/roles/r1/permissions'), async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json([
          { resource: 'contacts', action: 'manage' },
          { resource: 'leads', action: 'manage' },
        ]);
      }),
    );

    const wrapper = mountView();
    await flushPromises();

    await wrapper.find('input[aria-label="Grant access to Leads"]').setValue(true);
    // Toggling made the role dirty → Save becomes enabled.
    expect(saveChangesButton(wrapper).attributes('disabled')).toBeUndefined();

    await saveChangesButton(wrapper).trigger('click');
    await flushPromises();

    expect(sentBody).toEqual({
      permissions: [
        { resource: 'contacts', action: 'manage' },
        { resource: 'leads', action: 'manage' },
      ],
    });
  });
});

describe('RolesView — create modal', () => {
  beforeEach(() => {
    server.use(
      rolesRoute([
        { id: 'r1', name: 'Admin', permissions: [{ resource: 'contacts', action: 'manage' }] },
      ]),
    );
  });

  it('opens the modal from the header button and requires a name', async () => {
    let posted = false;
    server.use(
      http.post(api('/api/roles'), () => {
        posted = true;
        return HttpResponse.json({ id: 'x', name: 'x' });
      }),
    );

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.find('#create-role-name').exists()).toBe(false);
    await newRoleButton(wrapper).trigger('click');
    expect(wrapper.find('#create-role-name').exists()).toBe(true);

    await wrapper.find('.modal-stub form').trigger('submit');
    expect(wrapper.text()).toContain('Role name is required.');
    expect(posted).toBe(false);
  });

  it('creates a role with name and description, no permissions call when not copying', async () => {
    let postBody: unknown;
    let putHit = false;
    server.use(
      http.post(api('/api/roles'), async ({ request }) => {
        postBody = await request.json();
        return HttpResponse.json({
          id: 'new1',
          name: 'Editor',
          description: 'Edits things',
          permissions: [],
        });
      }),
      http.put(api('/api/roles/new1/permissions'), () => {
        putHit = true;
        return HttpResponse.json([]);
      }),
    );

    const wrapper = mountView();
    await flushPromises();
    await newRoleButton(wrapper).trigger('click');

    await wrapper.find('#create-role-name').setValue('Editor');
    await wrapper.find('#create-role-description').setValue('Edits things');
    await wrapper.find('.modal-stub form').trigger('submit');
    await flushPromises();

    expect(postBody).toEqual({ name: 'Editor', description: 'Edits things' });
    expect(putHit).toBe(false);
  });

  it('copies the source role module access via a second permissions call', async () => {
    server.use(
      rolesRoute([
        {
          id: 'r1',
          name: 'Admin',
          permissions: [
            { resource: 'contacts', action: 'manage' },
            { resource: 'leads', action: 'manage' },
          ],
        },
      ]),
    );
    let postBody: unknown;
    let putBody: unknown;
    server.use(
      http.post(api('/api/roles'), async ({ request }) => {
        postBody = await request.json();
        return HttpResponse.json({ id: 'new1', name: 'Copy', permissions: [] });
      }),
      http.put(api('/api/roles/new1/permissions'), async ({ request }) => {
        putBody = await request.json();
        return HttpResponse.json([
          { resource: 'contacts', action: 'manage' },
          { resource: 'leads', action: 'manage' },
        ]);
      }),
    );

    const wrapper = mountView();
    await flushPromises();
    await newRoleButton(wrapper).trigger('click');

    await wrapper.find('#create-role-name').setValue('Copy');
    await wrapper.find('.copy-select').setValue('r1');
    await wrapper.find('.modal-stub form').trigger('submit');
    await flushPromises();

    expect(postBody).toEqual({ name: 'Copy' });
    // Module access copied as this UI's per-module `manage` grants, in RESOURCES order.
    expect(putBody).toEqual({
      permissions: [
        { resource: 'contacts', action: 'manage' },
        { resource: 'leads', action: 'manage' },
      ],
    });
  });
});

describe('RolesView — loading / empty / error states', () => {
  it('shows a loading skeleton before the roles resolve', async () => {
    server.use(rolesRoute([{ id: 'r1', name: 'Admin', permissions: [] }]));

    const wrapper = mountView();
    // onMounted fires after the first render, so let the loading=true state paint
    // (one tick) before the MSW response resolves on a later task.
    await nextTick();
    expect(wrapper.find('.animate-pulse').exists()).toBe(true);

    await flushPromises();
    expect(wrapper.find('.animate-pulse').exists()).toBe(false);
  });

  it('shows the empty state when there are no roles', async () => {
    server.use(rolesRoute([]));

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('No roles yet');
  });

  it('shows an error banner with the server reason and recovers on Retry', async () => {
    server.use(
      http.get(api('/api/roles'), () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
    );

    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain("Couldn't load roles: boom");

    // Retry now succeeds.
    server.use(rolesRoute([{ id: 'r1', name: 'Admin', permissions: [] }]));
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Retry')!
      .trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Admin');
    expect(wrapper.text()).not.toContain("Couldn't load roles");
  });
});
