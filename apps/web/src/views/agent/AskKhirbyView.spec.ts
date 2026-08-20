import { describe, it, expect, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { http, HttpResponse } from 'msw';
import AskKhirbyView from './AskKhirbyView.vue';
import { useAuthStore } from '../../stores/auth.store';
import { mountWithI18n, resetLocale } from '../../test/i18n';
import { server } from '../../test/msw/server';
import { api } from '../../test/api-base';

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/ask', name: 'ask-new', component: AskKhirbyView }],
  });
}

async function mountAsk(permissions: { resource: string; action: string }[] = []) {
  const pinia = createPinia();
  setActivePinia(pinia);

  const auth = useAuthStore();
  auth.user = { id: 'u1', email: 'admin@example.com', locale: null, permissions };

  server.use(http.get(api('/api/agent/conversations'), () => HttpResponse.json([])));

  const router = makeRouter();
  await router.push('/ask');
  await router.isReady();

  return mountWithI18n(AskKhirbyView, {
    global: { plugins: [pinia, router] },
    props: { historyOpen: false },
  });
}

afterEach(() => {
  resetLocale();
});

describe('AskKhirbyView', () => {
  it('shows access denied without agent:use', async () => {
    const wrapper = await mountAsk([]);
    await flushPromises();

    expect(wrapper.text()).toContain('No access to Ask Khirby');
    expect(wrapper.find('textarea').exists()).toBe(false);
  });

  it('shows the empty chat state when agent:use is granted', async () => {
    const wrapper = await mountAsk([{ resource: 'agent', action: 'use' }]);
    await flushPromises();

    expect(wrapper.text()).toContain('Ask questions about your CRM data');
    expect(wrapper.find('textarea').attributes('placeholder')).toBe(
      'Ask about contacts, leads, plugins…',
    );
  });
});
