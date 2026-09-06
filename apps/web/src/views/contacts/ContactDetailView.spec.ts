import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ContactDetailView from './ContactDetailView.vue';
import { server } from '../../test/msw/server';
import { api } from '../../test/api-base';
import { mountWithI18n, resetLocale } from '../../test/i18n';

describe('ContactDetailView custom fields', () => {
  beforeEach(() => {
    server.use(
      http.get(api('/api/custom-fields'), () =>
        HttpResponse.json([
          { id: 'd1', entity: 'contact', name: 'MRR', slug: 'mrr', type: 'number', options: [] },
        ]),
      ),
      http.get(api('/api/contacts/c1'), () =>
        HttpResponse.json({
          id: 'c1',
          email: 'ada@example.com',
          name: 'Ada',
          metadata: {
            interests: [],
            custom: { mrr: 1200, orphan: 'should-not-show' },
          },
          submissions: [],
          leads: [],
        }),
      ),
    );
  });

  afterEach(() => {
    resetLocale();
    document.body.innerHTML = '';
  });

  it('shows defined custom fields and hides orphan keys from Other details', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/contacts/:id', name: 'contact-detail', component: ContactDetailView },
        { path: '/contacts', name: 'contacts', component: { template: '<div />' } },
      ],
    });
    await router.push('/contacts/c1');
    await router.isReady();

    const wrapper = mountWithI18n(ContactDetailView, {
      global: {
        plugins: [createPinia(), router],
        stubs: {
          MailThreadPanel: { template: '<div />' },
          AppTooltip: { template: '<span><slot /></span>' },
        },
      },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.text()).toContain('MRR');
    expect(wrapper.text()).not.toContain('orphan');
    expect(wrapper.text()).not.toContain('should-not-show');
  });
});
