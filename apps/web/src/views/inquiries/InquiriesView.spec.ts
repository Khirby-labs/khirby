import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import InquiriesView from './InquiriesView.vue';
import { mountWithI18n, withLocale, resetLocale } from '../../test/i18n';

const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => routerMock,
  RouterLink: { template: '<a><slot /></a>' },
}));

vi.mock('../../api/client', () => ({
  apiGet: vi.fn(),
}));

import { apiGet } from '../../api/client';

const AppSelectStub = { props: ['modelValue', 'options'], template: '<select></select>' };

function mountView() {
  return mountWithI18n(InquiriesView, {
    global: {
      stubs: {
        AppSelect: AppSelectStub,
      },
    },
  });
}

describe('InquiriesView', () => {
  beforeEach(() => {
    routerMock.push.mockClear();
    routerMock.replace.mockClear();
  });

  afterEach(() => {
    resetLocale();
    vi.resetAllMocks();
  });

  it('renders empty state when no inquiries', async () => {
    vi.mocked(apiGet).mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('No inquiries yet');
  });

  it('renders inquiries in the table', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      data: [
        {
          id: 'inq-1',
          status: 'ready_for_review',
          aiSummary: 'Needs CRM integration',
          contactName: 'Jan Kowalski',
          email: 'jan@example.com',
          companyName: 'Acme',
          proposedType: 'Sales',
          tags: ['crm', 'integration'],
          source: 'website',
          createdAt: '2026-09-01T10:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    } as any);

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('Jan Kowalski');
    expect(wrapper.text()).toContain('jan@example.com');
    expect(wrapper.text()).toContain('Needs CRM integration');
    expect(wrapper.text()).toContain('crm');
    expect(wrapper.text()).toContain('integration');
    expect(wrapper.find('.cursor-col-resize').exists()).toBe(true);
  });

  it('shows empty state when no results', async () => {
    vi.mocked(apiGet).mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toMatch(/No inquiries/);
  });

  it('navigates to inquiry detail on row click', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      data: [
        {
          id: 'inq-1',
          status: 'ready_for_review',
          aiSummary: null,
          contactName: null,
          email: 'test@example.com',
          companyName: null,
          proposedType: null,
          tags: [],
          source: null,
          createdAt: '2026-09-01T10:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    } as any);

    const wrapper = mountView();
    await flushPromises();

    // The AppTable emits row-click — find it and trigger
    const table = wrapper.findComponent({ name: 'AppTable' });
    await table.vm.$emit('row-click', { id: 'inq-1' });

    expect(routerMock.push).toHaveBeenCalledWith('/inquiries/inq-1');
  });

  it('renders Polish copy when locale is pl', async () => {
    vi.mocked(apiGet).mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });

    await withLocale('pl');
    const wrapper = mountView();
    await flushPromises();

    // Title always visible; empty state key depends on locale
    expect(wrapper.text()).toContain('Do weryfikacji');
    // Either "Brak zapytań" (none) or the filtered variant — both contain "zapytań"
    expect(wrapper.text()).toMatch(/zapytań|Brak zapytań/);
  });

  it('fetches with default status filter ready_for_review', async () => {
    vi.mocked(apiGet).mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 });

    mountView();
    await flushPromises();

    const firstCall = vi.mocked(apiGet).mock.calls[0]?.[0] as string | undefined;
    expect(firstCall).toContain('status=ready_for_review');
  });
});
