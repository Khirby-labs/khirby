import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import UsersView from './UsersView.vue';

// Router: UsersView registers onBeforeRouteLeave — stub it out (no router in the harness).
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn() }));

// The stores talk to the API client — mock it so we can assert on the calls.
vi.mock('../../api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

import { apiGet, apiPost } from '../../api/client';
import { mountWithI18n } from '../../test/i18n';

/** AppModal renders its slot behind a Reka portal/focus-trap — swap for a plain passthrough. */
const AppModalStub = { template: '<div class="modal-stub"><slot /></div>' };

function mountView() {
  return mountWithI18n(UsersView, {
    global: {
      plugins: [createPinia()],
      stubs: { AppModal: AppModalStub },
    },
  });
}

function newMemberButton(wrapper: ReturnType<typeof mountView>) {
  return wrapper.findAll('button').find((b) => b.attributes('aria-label') === 'New member');
}

describe('UsersView — create modal', () => {
  beforeEach(() => {
    // fetchUsers, then fetchRoles — resolve both, users first.
    vi.mocked(apiGet).mockImplementation((url: string) => {
      if (url === '/api/users') {
        return Promise.resolve([
          { id: 'u1', email: 'existing@example.com', createdAt: '2026-01-01', roles: [] },
        ]);
      }
      return Promise.resolve([{ id: 'r1', name: 'Admin' }]);
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('opens the modal from the header button and validates email + password', async () => {
    const wrapper = mountView();
    await flushPromises();

    // Modal isn't in the DOM until the button is clicked.
    expect(wrapper.find('#create-member-email').exists()).toBe(false);

    await newMemberButton(wrapper)!.trigger('click');
    expect(wrapper.find('#create-member-email').exists()).toBe(true);

    // Empty email → error, no API call.
    await wrapper.find('.modal-stub form').trigger('submit');
    expect(wrapper.text()).toContain('Email is required.');
    expect(apiPost).not.toHaveBeenCalled();

    // Email present but short password → password error, still no API call.
    await wrapper.find('#create-member-email').setValue('new@example.com');
    await wrapper.find('#create-member-password').setValue('short');
    await wrapper.find('.modal-stub form').trigger('submit');
    expect(wrapper.text()).toContain('Password must be at least 8 characters.');
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('renders resolved copy for the counted heading and a member without roles', async () => {
    const wrapper = mountView();
    await flushPromises();

    // One plural message each, not a word plus a '(n)' node and not a fraction
    // split into fragments. A missing key would surface as its path right here.
    // The fixture has one member and one role, so English takes its singular form.
    expect(wrapper.text()).toContain('Member (1)');
    expect(wrapper.text()).toContain('No roles');
    expect(wrapper.text()).toContain('0/1 role');
  });

  it('creates a member with email and password', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      id: 'u2',
      email: 'new@example.com',
      createdAt: '2026-02-02',
      roles: [],
    });

    const wrapper = mountView();
    await flushPromises();
    await newMemberButton(wrapper)!.trigger('click');

    await wrapper.find('#create-member-email').setValue('new@example.com');
    await wrapper.find('#create-member-password').setValue('supersecret');
    await wrapper.find('.modal-stub form').trigger('submit');
    await flushPromises();

    expect(apiPost).toHaveBeenCalledWith('/api/users', {
      email: 'new@example.com',
      password: 'supersecret',
    });
  });
});
