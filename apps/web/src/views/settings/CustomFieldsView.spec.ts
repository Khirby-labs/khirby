import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import CustomFieldsView from './CustomFieldsView.vue';
import { server } from '../../test/msw/server';
import { api } from '../../test/api-base';
import { mountWithI18n, resetLocale } from '../../test/i18n';

function mountView(): VueWrapper {
  return mountWithI18n(CustomFieldsView, { global: { plugins: [createPinia()] } });
}

describe('CustomFieldsView', () => {
  beforeEach(() => {
    server.use(http.get(api('/api/custom-fields'), () => HttpResponse.json([])));
  });

  afterEach(() => {
    resetLocale();
  });

  it('shows an empty state with Add field', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain('No custom fields');
    expect(wrapper.text()).toContain('Add field');
  });

  it('creates a number field from the add form', async () => {
    let created = 0;
    server.use(
      http.post(api('/api/custom-fields'), async ({ request }) => {
        created += 1;
        const body = (await request.json()) as { name: string; type: string };
        return HttpResponse.json(
          {
            id: 'f1',
            entity: 'contact',
            name: body.name,
            slug: 'mrr',
            type: body.type,
            options: [],
          },
          { status: 201 },
        );
      }),
    );

    const wrapper = mountView();
    await flushPromises();
    wrapper.get('button.btn-primary').trigger('click');
    await flushPromises();

    const nameInput = wrapper.get('input[type="text"]');
    await nameInput.setValue('MRR');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(created).toBe(1);
    expect(wrapper.text()).toContain('MRR');
  });
});
