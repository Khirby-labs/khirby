import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextTick } from 'vue';

type MqListener = (e: { matches: boolean }) => void;

const mqListeners: MqListener[] = [];
let mqMatches = true;

function mockMatchMedia() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: mqMatches,
    media: query,
    addEventListener: (_: string, cb: MqListener) => mqListeners.push(cb),
    removeEventListener: vi.fn(),
  }));
}

describe('useTheme', () => {
  beforeEach(() => {
    vi.resetModules();
    mqListeners.length = 0;
    mqMatches = true;
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    mockMatchMedia();
  });

  it('defaults to system preference and stamps data-theme', async () => {
    mqMatches = true;
    const { useTheme } = await import('./useTheme');
    const { preference, resolvedTheme } = useTheme();
    await nextTick();

    expect(preference.value).toBe('system');
    expect(resolvedTheme.value).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('resolves light when the OS prefers light', async () => {
    mqMatches = false;
    const { useTheme } = await import('./useTheme');
    const { resolvedTheme } = useTheme();
    await nextTick();

    expect(resolvedTheme.value).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('persists an explicit choice and applies it immediately', async () => {
    const { useTheme, THEME_STORAGE_KEY } = await import('./useTheme');
    const { setPreference, resolvedTheme } = useTheme();

    setPreference('light');
    await nextTick();

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(resolvedTheme.value).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('reads a stored preference on init', async () => {
    localStorage.setItem('crm-theme', 'light');
    const { useTheme } = await import('./useTheme');
    const { preference, resolvedTheme } = useTheme();
    await nextTick();

    expect(preference.value).toBe('light');
    expect(resolvedTheme.value).toBe('light');
  });

  it('follows OS changes while in system mode, ignores them when fixed', async () => {
    const { useTheme } = await import('./useTheme');
    const { setPreference, resolvedTheme } = useTheme();
    await nextTick();
    expect(resolvedTheme.value).toBe('dark');

    for (const cb of mqListeners) cb({ matches: false });
    await nextTick();
    expect(document.documentElement.dataset.theme).toBe('light');

    setPreference('dark');
    for (const cb of mqListeners) cb({ matches: true });
    await nextTick();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
