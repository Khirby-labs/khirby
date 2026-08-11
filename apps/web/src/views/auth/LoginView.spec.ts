import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import LoginView from './LoginView.vue';
import { server } from '../../test/msw/server';
import { api } from '../../test/api-base';
import { mountWithI18n } from '../../test/i18n';

/**
 * Component test (see .claude/rules/web.md → "Methodology"). We mount the real
 * view with a real auth store + api client and a real (memory) router, mocking
 * only the network via MSW. Assertions are what the user observes: an error
 * message, the button's state, and where they land after signing in.
 */

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/login' },
      { path: '/login', name: 'login', component: { template: '<div />' } },
      { path: '/contacts', name: 'contacts', component: { template: '<div>contacts</div>' } },
    ],
  });
}

async function mountLogin(): Promise<{ wrapper: VueWrapper; router: Router }> {
  const router = makeRouter();
  router.push('/login');
  await router.isReady();
  const wrapper = mountWithI18n(LoginView, { global: { plugins: [createPinia(), router] } });
  return { wrapper, router };
}

const signInButton = (wrapper: VueWrapper) =>
  wrapper.findAll('button').find((b) => b.attributes('type') === 'submit')!;

describe('LoginView', () => {
  beforeEach(() => {
    // default happy path; individual tests override
    server.use(
      http.post(api('/api/auth/login'), () =>
        HttpResponse.json({ user: { id: 'u1', email: 'admin@example.com' } }),
      ),
    );
  });

  it('renders resolved copy, not message keys', async () => {
    const { wrapper } = await mountLogin();

    // The page renders before any session exists, so this copy comes from the
    // global i18n instance alone. A missing key would show its path instead.
    expect(wrapper.text()).toContain('Sign in to your account');
    expect(wrapper.find('label[for="email"]').text()).toBe('Email');
    expect(wrapper.find('label[for="password"]').text()).toBe('Password');
    expect(wrapper.find('#email').attributes('placeholder')).toBe('you@example.com');
    expect(signInButton(wrapper).text()).toBe('Sign in');
  });

  it('shows the server error message and does not navigate on bad credentials', async () => {
    server.use(
      http.post(api('/api/auth/login'), () =>
        HttpResponse.json({ message: 'Invalid credentials' }, { status: 400 }),
      ),
    );

    const { wrapper, router } = await mountLogin();
    await wrapper.find('#email').setValue('admin@example.com');
    await wrapper.find('#password').setValue('wrong');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('.crm-error').text()).toBe('Invalid credentials');
    expect(router.currentRoute.value.name).toBe('login');
  });

  it('navigates to /contacts after a successful sign in', async () => {
    const { wrapper, router } = await mountLogin();
    await wrapper.find('#email').setValue('admin@example.com');
    await wrapper.find('#password').setValue('secret');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/contacts');
    expect(wrapper.find('.crm-error').exists()).toBe(false);
  });

  it('disables the button and shows a pending label while the request is in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      http.post(api('/api/auth/login'), async () => {
        await gate;
        return HttpResponse.json({ user: { id: 'u1', email: 'admin@example.com' } });
      }),
    );

    const { wrapper } = await mountLogin();
    await wrapper.find('#email').setValue('admin@example.com');
    await wrapper.find('#password').setValue('secret');
    wrapper.find('form').trigger('submit');
    await nextTick();

    const btn = signInButton(wrapper);
    expect(btn.attributes('disabled')).toBeDefined();
    expect(btn.text()).toBe('Signing in…');

    release();
    await flushPromises();
    expect(signInButton(wrapper).text()).toBe('Sign in');
  });
});
