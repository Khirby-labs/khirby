import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia } from 'pinia';
import type { LeadAssignee, PipelineStage } from '@khirby/types';
import AddLeadModal from './AddLeadModal.vue';
import { server } from '../../test/msw/server';
import { api } from '../../test/api-base';
import { mountWithI18n } from '../../test/i18n';

/**
 * Component test (see .claude/rules/web.md → "Methodology"). Real form + real
 * pipeline store + real api client; only the network is mocked (MSW). The Reka
 * dialog/select primitives are stubbed to plain controls so the form is
 * queryable — the boundary under test is the request the backend receives and
 * the events the parent observes, not Reka's rendering.
 */

const AppModalStub = { template: '<div class="modal-stub"><slot /></div>' };
const AppSelectStub = {
  props: ['modelValue', 'options'],
  emits: ['update:modelValue'],
  template: `<select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
    <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
  </select>`,
};

const stages: PipelineStage[] = [
  { id: 's1', name: 'New', color: '#000', position: 0, isWon: false, isLost: false },
  { id: 's2', name: 'Won', color: '#000', position: 1, isWon: true, isLost: false },
];
const assignees: LeadAssignee[] = [{ id: 'a1', email: 'rep@example.com' }];

function mountModal(): VueWrapper {
  return mountWithI18n(AddLeadModal, {
    props: { stages, assignees },
    global: {
      plugins: [createPinia()],
      stubs: { AppModal: AppModalStub, AppSelect: AppSelectStub },
    },
  });
}

describe('AddLeadModal', () => {
  beforeEach(() => {
    server.use(
      http.post(api('/api/leads'), () => HttpResponse.json({ id: 'lead-1' }, { status: 201 })),
    );
  });

  it('marks the email field required', () => {
    const wrapper = mountModal();
    expect(wrapper.find('input[type="email"]').attributes('required')).toBeDefined();
  });

  it('POSTs a trimmed lead payload and emits created + close on success', async () => {
    let sentBody: Record<string, unknown> | undefined;
    server.use(
      http.post(api('/api/leads'), async ({ request }) => {
        sentBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'lead-1' }, { status: 201 });
      }),
    );

    const wrapper = mountModal();
    await wrapper.find('input[type="email"]').setValue('  buyer@example.com  ');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    // empty optional fields are dropped; stage defaults to the first column.
    expect(sentBody).toEqual({ email: 'buyer@example.com', priority: 'medium', stageId: 's1' });
    expect(wrapper.emitted('created')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('surfaces a server error and does not emit created', async () => {
    server.use(
      http.post(api('/api/leads'), () =>
        HttpResponse.json({ message: 'Email already a lead' }, { status: 409 }),
      ),
    );

    const wrapper = mountModal();
    await wrapper.find('input[type="email"]').setValue('dupe@example.com');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    // pipeline.store.createLead surfaces the server's reason (no longer a generic
    // "Failed to create lead"), so the user sees why the 409 happened.
    const banner = wrapper.find('.crm-error');
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toBe('Email already a lead');
    expect(wrapper.emitted('created')).toBeUndefined();
  });

  it('disables the submit and shows a pending label while creating', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      http.post(api('/api/leads'), async () => {
        await gate;
        return HttpResponse.json({ id: 'lead-1' }, { status: 201 });
      }),
    );

    const wrapper = mountModal();
    await wrapper.find('input[type="email"]').setValue('buyer@example.com');
    wrapper.find('form').trigger('submit');
    await nextTick();

    const submit = wrapper.findAll('button').find((b) => b.attributes('type') === 'submit')!;
    expect(submit.attributes('disabled')).toBeDefined();
    expect(submit.text()).toBe('Creating…');

    release();
    await flushPromises();
  });

  it('POSTs capture-as-lead when captureThreadId is set', async () => {
    let sentBody: Record<string, unknown> | undefined;
    let capturedUrl = '';
    server.use(
      http.post(api('/api/mail/threads/:id/capture-as-lead'), async ({ request, params }) => {
        capturedUrl = String(params.id);
        sentBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: 't1',
          subject: 'Hi',
          contactId: 'c1',
          contactEmail: 'buyer@example.com',
          contactName: 'Jan',
          leadId: 'lead-1',
          leadTitle: 'Jan',
          lastMessageAt: new Date().toISOString(),
          messageCount: 1,
          lastDirection: 'inbound',
          createdAt: new Date().toISOString(),
          messages: [],
        });
      }),
    );

    const wrapper = mountWithI18n(AddLeadModal, {
      props: {
        stages,
        assignees,
        initialEmail: 'buyer@example.com',
        captureThreadId: 'thread-99',
        messageSnippet: 'Cześć, Jan Kowalski z firmy X',
      },
      global: {
        plugins: [createPinia()],
        stubs: { AppModal: AppModalStub, AppSelect: AppSelectStub },
      },
    });

    expect(wrapper.text()).toContain('Cześć, Jan Kowalski z firmy X');
    expect(wrapper.find('input[type="email"]').element).toHaveProperty(
      'value',
      'buyer@example.com',
    );

    const nameInput = wrapper.find('input[type="text"]');
    await nameInput.setValue('Jan Kowalski');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(capturedUrl).toBe('thread-99');
    expect(sentBody).toEqual(
      expect.objectContaining({
        email: 'buyer@example.com',
        name: 'Jan Kowalski',
        priority: 'medium',
        stageId: 's1',
      }),
    );
    expect(wrapper.emitted('created')).toHaveLength(1);
  });
});
