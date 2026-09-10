import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import ControlPlaneCard from './ControlPlaneCard.vue';
import { mountWithI18n, resetLocale } from '../../test/i18n';

vi.mock('../../api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock('../../stores/toast.store', () => ({
  useToastStore: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

import { apiGet, apiPost } from '../../api/client';

function mountCard() {
  return mountWithI18n(ControlPlaneCard);
}

describe('ControlPlaneCard', () => {
  afterEach(() => {
    resetLocale();
    vi.resetAllMocks();
  });

  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiPost).mockReset();
  });

  it('shows installation id, telemetry, email and heartbeat', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      controlPlaneUrlConfigured: true,
      telemetryDisabled: false,
      installationId: '11111111-2222-3333-4444-555555555555',
      registeredEmail: 'admin@example.com',
      lastHeartbeatAt: '2026-09-09T12:00:00.000Z',
    });

    const wrapper = mountCard();
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain('Control Plane');
    expect(text).toContain('11111111-2222-3333-4444-555555555555');
    expect(text).toContain('admin@example.com');
    expect(text).toContain('On');
    expect(text).not.toContain('CONTROL_PLANE_URL is not set');
  });

  it('hides the email form when registered until Edit is clicked', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      controlPlaneUrlConfigured: true,
      telemetryDisabled: false,
      installationId: '11111111-2222-3333-4444-555555555555',
      registeredEmail: 'admin@example.com',
      lastHeartbeatAt: '2026-09-09T12:00:00.000Z',
    });

    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.find('input[type="email"]').exists()).toBe(false);
    expect(wrapper.find('form').exists()).toBe(false);

    const edit = wrapper.findAll('button').find((b) => b.text() === 'Edit');
    expect(edit).toBeTruthy();
    await edit!.trigger('click');

    expect(wrapper.find('input[type="email"]').exists()).toBe(true);
    expect((wrapper.find('input[type="email"]').element as HTMLInputElement).value).toBe(
      'admin@example.com',
    );
  });

  it('registers an email and refreshes the displayed address', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      controlPlaneUrlConfigured: true,
      telemetryDisabled: true,
      installationId: '11111111-2222-3333-4444-555555555555',
      registeredEmail: null,
      lastHeartbeatAt: null,
    });
    vi.mocked(apiPost).mockResolvedValue({
      installationId: '11111111-2222-3333-4444-555555555555',
      registeredEmail: 'ops@example.com',
      registeredAt: '2026-09-09T13:00:00.000Z',
    });

    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.text()).toContain('Off');
    expect(wrapper.text()).toContain('Not registered');
    expect(wrapper.text()).toContain('Never');
    expect(wrapper.find('input[type="email"]').exists()).toBe(true);

    await wrapper.find('input[type="email"]').setValue('ops@example.com');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(apiPost).toHaveBeenCalledWith('/api/system/control-plane/register', {
      email: 'ops@example.com',
    });
    expect(wrapper.text()).toContain('ops@example.com');
    // After first registration the form collapses behind Edit.
    expect(wrapper.find('input[type="email"]').exists()).toBe(false);
  });

  it('disables register when Control Plane URL is not configured', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      controlPlaneUrlConfigured: false,
      telemetryDisabled: false,
      installationId: '11111111-2222-3333-4444-555555555555',
      registeredEmail: null,
      lastHeartbeatAt: null,
    });

    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.text()).toContain('CONTROL_PLANE_URL is not set');
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
  });
});
