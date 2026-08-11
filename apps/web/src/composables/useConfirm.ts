import { reactive, readonly } from 'vue';
import { i18n } from '../i18n';

/**
 * Promise-based confirmation for destructive actions — docs/DESIGN-SYSTEM.md §5:
 * destructive actions always confirm; the confirm button names the object
 * ("Delete stage", never "Confirm"/"OK").
 *
 * Usage: const confirm = useConfirm();
 *        if (!(await confirm({ title, message, confirmLabel: 'Delete stage' }))) return;
 * Rendered by <ConfirmDialogHost/> mounted once in App.vue.
 */
export interface ConfirmOptions {
  title: string;
  message: string;
  /** Names the action + object, e.g. "Delete stage" */
  confirmLabel: string;
  cancelLabel?: string;
  /** Danger styling by default — confirms exist mostly for destructive paths */
  danger?: boolean;
}

interface ConfirmState extends Required<ConfirmOptions> {
  open: boolean;
  resolve: ((confirmed: boolean) => void) | null;
}

const state = reactive<ConfirmState>({
  open: false,
  title: '',
  message: '',
  confirmLabel: '',
  cancelLabel: '',
  danger: true,
  resolve: null,
});

export function useConfirm() {
  return (options: ConfirmOptions): Promise<boolean> => {
    // A second confirm while one is open cancels the first — last caller wins
    state.resolve?.(false);
    state.title = options.title;
    state.message = options.message;
    state.confirmLabel = options.confirmLabel;
    // Resolved lazily: this module's `reactive` initializer runs at import,
    // before app.use(i18n), so a default there would freeze at the boot locale.
    state.cancelLabel = options.cancelLabel ?? i18n.global.t('common.actions.cancel');
    state.danger = options.danger ?? true;
    state.open = true;
    return new Promise<boolean>((resolve) => {
      state.resolve = resolve;
    });
  };
}

/** Internal — used by ConfirmDialogHost only */
export function useConfirmState() {
  /**
   * First settle wins. We capture and null the resolver *before* resolving and
   * before closing, so any follow-up settle (e.g. the AlertDialogRoot's
   * `@update:open(false)` that fires when we set `open = false`, or a listener
   * that runs out of order) is a no-op instead of overwriting the outcome.
   * The dialog is closed here too — settling and closing are inseparable.
   */
  function settle(confirmed: boolean) {
    const resolve = state.resolve;
    state.resolve = null;
    state.open = false;
    resolve?.(confirmed);
  }
  return { state: readonly(state), settle };
}
