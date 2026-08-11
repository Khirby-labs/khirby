import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUiStore } from './ui.store';

describe('ui store', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('defaults to an expanded sidebar and closed palette', () => {
    const ui = useUiStore();
    expect(ui.railCollapsed).toBe(false);
    expect(ui.commandOpen).toBe(false);
    expect(ui.mobileNavOpen).toBe(false);
  });

  it('persists the rail preference across store instances', () => {
    const ui = useUiStore();
    ui.toggleRail();
    expect(ui.railCollapsed).toBe(true);
    expect(localStorage.getItem('crm-sidebar-rail')).toBe('1');

    // A fresh Pinia reads the persisted value on init.
    setActivePinia(createPinia());
    expect(useUiStore().railCollapsed).toBe(true);
  });

  it('opens, closes, and toggles the command palette', () => {
    const ui = useUiStore();
    ui.openCommand();
    expect(ui.commandOpen).toBe(true);
    ui.closeCommand();
    expect(ui.commandOpen).toBe(false);
    ui.toggleCommand();
    expect(ui.commandOpen).toBe(true);
  });
});
