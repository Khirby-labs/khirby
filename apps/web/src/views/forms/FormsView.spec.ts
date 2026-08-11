import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import FormsView from './FormsView.vue';
import { useConfirmState } from '../../composables/useConfirm';

const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => routerMock,
  RouterLink: { template: '<a><slot /></a>' },
}));

vi.mock('../../api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

import { apiGet, apiPost, apiDelete } from '../../api/client';
import { mountWithI18n, withLocale, resetLocale } from '../../test/i18n';

const AppModalStub = { props: ['title'], template: '<div class="modal-stub"><slot /></div>' };
const AppSelectStub = { props: ['modelValue', 'options'], template: '<select></select>' };
const AppCheckboxStub = { props: ['modelValue'], template: '<label><slot /></label>' };
const PageActionsStub = { template: '<div><slot /></div>' };

function mountView() {
  return mountWithI18n(FormsView, {
    global: {
      plugins: [createPinia()],
      stubs: {
        AppModal: AppModalStub,
        AppSelect: AppSelectStub,
        AppCheckbox: AppCheckboxStub,
        PageActions: PageActionsStub,
      },
    },
  });
}

function buttonByText(wrapper: ReturnType<typeof mountView>, text: string) {
  return wrapper.findAll('button').find((b) => b.text().trim() === text);
}

describe('FormsView', () => {
  beforeEach(() => {
    routerMock.push.mockClear();
    routerMock.replace.mockClear();
  });
  afterEach(() => {
    resetLocale();
    vi.resetAllMocks();
  });

  it('creates a form and navigates to the builder', async () => {
    vi.mocked(apiGet).mockResolvedValue([]); // empty list → empty state
    vi.mocked(apiPost).mockResolvedValue({ id: 'new-id', name: 'My Form', slug: 'my-form' } as any);

    const wrapper = mountView();
    await flushPromises();

    await buttonByText(wrapper, '+ Create form')!.trigger('click');
    await wrapper.find('#form-name').setValue('My Form');
    await wrapper.find('#form-slug').setValue('my-form');
    await wrapper.find('.modal-stub form').trigger('submit');
    await flushPromises();

    expect(apiPost).toHaveBeenCalledWith(
      '/api/forms',
      expect.objectContaining({ name: 'My Form', slug: 'my-form' }),
    );
    expect(routerMock.push).toHaveBeenCalledWith('/forms/new-id');
  });

  it('deletes a form only after the confirm dialog is accepted', async () => {
    vi.mocked(apiGet).mockResolvedValue([
      {
        id: 'f1',
        name: 'Form 1',
        slug: 'form-1',
        kind: 'contact',
        active: true,
        submissionCount: 0,
        schema: [],
        endpointToken: 't',
        createdAt: '2026-01-01',
      },
    ] as any);
    vi.mocked(apiDelete).mockResolvedValue(undefined as any);

    const wrapper = mountView();
    await flushPromises();

    await buttonByText(wrapper, 'Delete')!.trigger('click');

    // The confirm dialog is now open — nothing deleted until the user accepts.
    const { state, settle } = useConfirmState();
    expect(state.open).toBe(true);
    expect(apiDelete).not.toHaveBeenCalled();

    settle(true);
    await flushPromises();

    expect(apiDelete).toHaveBeenCalledWith('/api/forms/f1');
  });

  /*
   * `form.kind` is a persisted enum that used to be rendered raw under CSS
   * `capitalize`. It goes through a label map now, so a Polish operator sees Polish
   * while the stored token stays "waitlist".
   */
  it('labels the persisted kind and status tokens in the active locale', async () => {
    vi.mocked(apiGet).mockResolvedValue([
      {
        id: 'f1',
        name: 'Lista mailingowa',
        slug: 'lista-mailingowa',
        kind: 'waitlist',
        active: false,
        submissionCount: 1200,
        schema: [],
        endpointToken: 't',
        createdAt: '2026-01-01',
      },
    ] as any);

    await withLocale('pl');
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('Formularze');
    expect(wrapper.text()).toContain('Lista oczekujących');
    expect(wrapper.text()).toContain('Nieaktywny');
  });
});
