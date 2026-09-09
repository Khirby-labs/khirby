import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import VersionCard from './VersionCard.vue';
import { mountWithI18n, resetLocale } from '../../test/i18n';

vi.mock('../../api/client', () => ({
  apiGet: vi.fn(),
}));

import { apiGet } from '../../api/client';

function mountCard() {
  return mountWithI18n(VersionCard);
}

describe('VersionCard', () => {
  afterEach(() => {
    resetLocale();
    vi.resetAllMocks();
  });

  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
  });

  it('shows the running version and an update banner when a newer release exists', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      current: '1.1.5',
      latest: '1.2.0',
      updateAvailable: true,
      releaseUrl: 'https://github.com/Khirby-labs/khirby/releases/tag/v1.2.0',
      checkedAt: '2026-09-09T12:00:00.000Z',
      checkFailed: false,
    });

    const wrapper = mountCard();
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain('Version');
    expect(text).toContain('1.1.5');
    expect(text).toContain('1.2.0');
    expect(text).toContain('A newer release is available.');
    expect(wrapper.find('a').attributes('href')).toContain('/releases/tag/v1.2.0');
  });

  it('says the instance is up to date when versions match', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      current: '1.2.0',
      latest: '1.2.0',
      updateAvailable: false,
      releaseUrl: 'https://github.com/Khirby-labs/khirby/releases/tag/v1.2.0',
      checkedAt: '2026-09-09T12:00:00.000Z',
      checkFailed: false,
    });

    const wrapper = mountCard();
    await flushPromises();

    expect(wrapper.text()).toContain('This instance is on the latest release.');
    expect(wrapper.find('a').exists()).toBe(false);
  });

  it('keeps the running version when the check fails', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      current: '1.1.5',
      latest: null,
      updateAvailable: false,
      releaseUrl: null,
      checkedAt: null,
      checkFailed: true,
    });

    const wrapper = mountCard();
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain('1.1.5');
    expect(text).toContain('Could not check for updates right now.');
  });
});
