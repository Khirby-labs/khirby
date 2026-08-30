import { describe, it, expect, afterEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { http, HttpResponse } from 'msw';
import AskKhirbyView from './AskKhirbyView.vue';
import { useAuthStore } from '../../stores/auth.store';
import { useAgentChatStore } from '../../stores/agent-chat.store';
import { mountWithI18n, resetLocale } from '../../test/i18n';
import { server } from '../../test/msw/server';
import { api } from '../../test/api-base';

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/ask', name: 'ask-new', component: AskKhirbyView },
      {
        path: '/plugins/hello-stats',
        name: 'plugin-hello-stats',
        component: { template: '<div>plugin</div>' },
      },
    ],
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

  const wrapper = mountWithI18n(AskKhirbyView, {
    global: { plugins: [pinia, router] },
    props: { historyOpen: false },
  });
  return { wrapper, router };
}

afterEach(() => {
  resetLocale();
});

describe('AskKhirbyView', () => {
  it('shows access denied without agent:use', async () => {
    const { wrapper } = await mountAsk([]);
    await flushPromises();

    expect(wrapper.text()).toContain('No access to Ask Khirby');
    expect(wrapper.find('textarea').exists()).toBe(false);
  });

  it('shows the empty chat state when agent:use is granted', async () => {
    const { wrapper } = await mountAsk([{ resource: 'agent', action: 'use' }]);
    await flushPromises();

    expect(wrapper.text()).toContain('Ask questions about your CRM data');
    expect(wrapper.find('textarea').attributes('placeholder')).toBe(
      'Ask about contacts, leads, plugins…',
    );
  });

  it('navigates in-app when an assistant markdown link to /plugins/ is clicked', async () => {
    const { wrapper, router } = await mountAsk([{ resource: 'agent', action: 'use' }]);
    const chat = useAgentChatStore();
    chat.messages = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'Gotowe. Aby zobaczyć nowy plugin, kliknij [tutaj](/plugins/hello-stats).',
        createdAt: new Date().toISOString(),
      },
    ];
    await flushPromises();

    const push = vi.spyOn(router, 'push');
    const anchor = wrapper.find('.md-prose a');
    expect(anchor.attributes('href')).toBe('/plugins/hello-stats');

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    anchor.element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(push).toHaveBeenCalledWith('/plugins/hello-stats');
  });

  it('shows a relative timestamp and copy control on finished messages', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const { wrapper } = await mountAsk([{ resource: 'agent', action: 'use' }]);
    const chat = useAgentChatStore();
    chat.messages = [
      {
        id: 'u1',
        role: 'user',
        content: 'cześć',
        createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      },
      {
        id: 'a1',
        role: 'assistant',
        content: 'Hej — w czym pomóc?',
        createdAt: new Date(Date.now() - 4 * 60_000).toISOString(),
      },
    ];
    await flushPromises();

    expect(wrapper.findAll('time').length).toBe(2);
    const copyButtons = wrapper.findAll('button').filter((b) => b.text() === 'Copy');
    expect(copyButtons.length).toBe(2);
    await copyButtons[1]!.trigger('click');
    expect(writeText).toHaveBeenCalledWith('Hej — w czym pomóc?');
  });
});
