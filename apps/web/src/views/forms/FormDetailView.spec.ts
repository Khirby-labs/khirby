import { describe, it, expect, afterEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import FormDetailView from './FormDetailView.vue';

// The view reads route.params.id and registers onBeforeRouteLeave — no router in the harness.
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'f1' } }),
  onBeforeRouteLeave: vi.fn(),
  RouterLink: { template: '<a><slot /></a>' },
}));

// Mock the API client so we can assert what the backend sees on the wire.
vi.mock('../../api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

import { apiGet, apiPatch } from '../../api/client';
import { mountWithI18n, withLocale, resetLocale } from '../../test/i18n';

const AppSelectStub = { props: ['modelValue', 'options'], template: '<select></select>' };
const AppCheckboxStub = { props: ['modelValue'], template: '<label><slot /></label>' };
const SkeletonRowsStub = { template: '<div />' };
// Save lives in <PageActions> (teleports to the shell top bar) — render its slot inline.
const PageActionsStub = { template: '<div><slot /></div>' };

type Field = {
  name: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
};

function formResponse(schema: Field[]) {
  return {
    id: 'f1',
    name: 'Contact us',
    slug: 'contact-us',
    kind: 'contact',
    active: true,
    endpointToken: 'tok-1',
    createdAt: '2026-01-01',
    schema,
  };
}

const validSchema: Field[] = [{ name: 'email', label: 'Email', type: 'email', required: true }];

function stubApi(schema: Field[]) {
  vi.mocked(apiGet).mockImplementation((url: string) => {
    if (url === '/api/forms/f1') return Promise.resolve(formResponse(schema)) as any;
    return Promise.resolve({ data: [], total: 0, page: 1, pageSize: 20 }) as any;
  });
}

function mountView() {
  return mountWithI18n(FormDetailView, {
    global: {
      plugins: [createPinia()],
      stubs: {
        AppSelect: AppSelectStub,
        AppCheckbox: AppCheckboxStub,
        SkeletonRows: SkeletonRowsStub,
        PageActions: PageActionsStub,
      },
    },
  });
}

function nameInputs(wrapper: ReturnType<typeof mountView>) {
  return wrapper.findAll('input[placeholder="e.g. first_name"]');
}
function buttonByText(wrapper: ReturnType<typeof mountView>, text: string) {
  return wrapper.findAll('button').find((b) => b.text().trim() === text);
}

describe('FormDetailView — builder', () => {
  afterEach(() => {
    resetLocale();
    vi.resetAllMocks();
  });

  it('adds and removes schema fields', async () => {
    stubApi(validSchema);
    const wrapper = mountView();
    await flushPromises();
    expect(nameInputs(wrapper)).toHaveLength(1);

    await buttonByText(wrapper, '+ Add field')!.trigger('click');
    expect(nameInputs(wrapper)).toHaveLength(2);

    const removeButtons = wrapper.findAll('button').filter((b) => b.text().trim() === 'Remove');
    await removeButtons[removeButtons.length - 1].trigger('click');
    expect(nameInputs(wrapper)).toHaveLength(1);
  });

  it('reorders fields with the move-up control', async () => {
    stubApi(validSchema);
    const wrapper = mountView();
    await flushPromises();

    await buttonByText(wrapper, '+ Add field')!.trigger('click');
    // Name the new (2nd) field, then move it above the email field.
    await nameInputs(wrapper)[1].setValue('zzz');
    await wrapper.find('[aria-label="Move field 2 up"]').trigger('click');

    expect((nameInputs(wrapper)[0].element as HTMLInputElement).value).toBe('zzz');
    expect((nameInputs(wrapper)[1].element as HTMLInputElement).value).toBe('email');
  });

  it('renders a live preview of the current fields', async () => {
    stubApi(validSchema);
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('Live preview');
    // The email field's label surfaces in the preview form.
    expect(wrapper.text()).toContain('Email');
  });

  it('saves the edited schema via a PATCH on the wire', async () => {
    stubApi(validSchema);
    vi.mocked(apiPatch).mockResolvedValue(formResponse(validSchema) as any);
    const wrapper = mountView();
    await flushPromises();

    await buttonByText(wrapper, 'Save changes')!.trigger('click');
    await flushPromises();

    expect(apiPatch).toHaveBeenCalledWith(
      '/api/forms/f1',
      expect.objectContaining({
        slug: 'contact-us',
        schema: [
          {
            name: 'email',
            label: 'Email',
            labels: { en: 'Email' },
            type: 'email',
            required: true,
          },
        ],
      }),
    );
  });

  it('edits and saves the options of a select field', async () => {
    stubApi([
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'plan', label: 'Plan', type: 'select', required: true, options: ['Free', 'Pro'] },
    ]);
    vi.mocked(apiPatch).mockResolvedValue(formResponse(validSchema) as any);
    const wrapper = mountView();
    await flushPromises();

    const optionsInput = wrapper.find('input[placeholder="e.g. Small, Medium, Large"]');
    expect(optionsInput.exists()).toBe(true);
    expect((optionsInput.element as HTMLInputElement).value).toBe('Free, Pro');

    await optionsInput.setValue('Free, Pro, Team');
    await buttonByText(wrapper, 'Save changes')!.trigger('click');
    await flushPromises();

    expect(apiPatch).toHaveBeenCalledWith(
      '/api/forms/f1',
      expect.objectContaining({
        schema: expect.arrayContaining([
          expect.objectContaining({
            name: 'plan',
            type: 'select',
            options: ['Free', 'Pro', 'Team'],
          }),
        ]),
      }),
    );
  });

  it('blocks the save and explains when no required email field is present', async () => {
    stubApi([{ name: 'message', label: 'Message', type: 'textarea', required: true }]);
    const wrapper = mountView();
    await flushPromises();

    await buttonByText(wrapper, 'Save changes')!.trigger('click');
    await flushPromises();

    expect(apiPatch).not.toHaveBeenCalled();
    // Resolved copy, not a key — and the schema identifier is a parameter, so it
    // stays "email" in every locale (curly quotes come from the message).
    expect(wrapper.text()).toContain('Add a required “email” field');
  });

  /*
   * The one <i18n-t>-with-slot case in the app: the sentence keeps the <code>email</code>
   * identifier mid-sentence instead of being split across DOM nodes.
   */
  it('keeps the email hint one sentence with the identifier in a code element', async () => {
    stubApi(validSchema);
    const wrapper = mountView();
    await flushPromises();

    const hint = wrapper
      .findAll('p')
      .find((p) => p.text().startsWith('Submissions are matched to contacts by email'));
    expect(hint).toBeDefined();
    expect(hint!.find('code').text()).toBe('email');
    expect(hint!.text()).toBe(
      'Submissions are matched to contacts by email, so a form with fields must include a required email field.',
    );
  });

  it('renders the whole builder in Polish when the locale switches', async () => {
    stubApi(validSchema);
    await withLocale('pl');
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('Zapisz zmiany');
    expect(wrapper.text()).toContain('Pola formularza');
    // Persisted tokens get a label map, never text-transform: capitalize.
    expect(wrapper.text()).toContain('E-mail');
    // Visitor EN label is stored data seeded in English — it must NOT follow UI locale.
    expect(
      (wrapper.find('input[placeholder="np. Full name"]').element as HTMLInputElement).value,
    ).toBe('Email');
  });
});
