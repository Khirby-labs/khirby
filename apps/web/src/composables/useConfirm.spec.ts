import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import ConfirmDialogHost from '../components/ui/ConfirmDialogHost.vue';
import { useConfirm } from './useConfirm';
import { mountWithI18n } from '../test/i18n';

/**
 * Regression test for the bug where the confirm dialog never resolved `true`,
 * so every destructive action (delete role/user/stage) was a silent no-op.
 * Root cause: AlertDialogAction wraps DialogClose, whose internal onOpenChange(false)
 * resolved the promise false before the app's settle(true) ran.
 */

function findButtonByText(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === label,
  ) as HTMLButtonElement | undefined;
}

describe('useConfirm + ConfirmDialogHost', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    wrapper = mountWithI18n(ConfirmDialogHost, { attachTo: document.body });
  });

  afterEach(() => {
    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('resolves TRUE when the confirm button is clicked', async () => {
    const askConfirm = useConfirm();
    const promise = askConfirm({
      title: 'Delete role',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete role',
    });
    await nextTick();
    await nextTick();

    const confirmBtn = findButtonByText('Delete role');
    expect(confirmBtn, 'confirm button should be rendered').toBeTruthy();
    confirmBtn!.click();

    await expect(promise).resolves.toBe(true);
  });

  it('resolves FALSE when the cancel button is clicked', async () => {
    const askConfirm = useConfirm();
    const promise = askConfirm({
      title: 'Delete role',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete role',
      cancelLabel: 'Cancel',
    });
    await nextTick();
    await nextTick();

    const cancelBtn = findButtonByText('Cancel');
    expect(cancelBtn, 'cancel button should be rendered').toBeTruthy();
    cancelBtn!.click();

    await expect(promise).resolves.toBe(false);
  });

  it('resolves FALSE when Escape is pressed', async () => {
    const askConfirm = useConfirm();
    const promise = askConfirm({
      title: 'Delete role',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete role',
    });
    await nextTick();
    await nextTick();

    // Reka's DismissableLayer binds Escape via VueUse onKeyStroke, which listens
    // on `window` by default (not `document`).
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    await expect(promise).resolves.toBe(false);
  });
});
