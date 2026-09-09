import * as Vue from 'vue';
import * as VueRouter from 'vue-router';
import * as VueI18n from 'vue-i18n';
import AppTable from '../components/AppTable.vue';
import AppModal from '../components/AppModal.vue';
import AppSelect from '../components/ui/AppSelect.vue';
import AppDatePicker from '../components/ui/AppDatePicker.vue';
import { useConfirm } from '../composables/useConfirm';

export type KhirbyWebUi = {
  AppTable: typeof AppTable;
  AppModal: typeof AppModal;
  AppSelect: typeof AppSelect;
  AppDatePicker: typeof AppDatePicker;
  useConfirm: typeof useConfirm;
};

export type KhirbyPeers = {
  Vue: typeof Vue;
  VueRouter: typeof VueRouter;
  VueI18n: typeof VueI18n;
  webUi: KhirbyWebUi;
};

declare global {
  interface Window {
    /** Host peer modules for volume plugin web bundles (ADR-0043). */
    __KHIRBY__?: KhirbyPeers;
  }
}

/**
 * Expose the running SPA's Vue peers + common web-ui components on
 * `window.__KHIRBY__` so import-map shims under `/khirby-peers/` can re-export
 * them to hot-loaded plugin ESM.
 * Must run before any plugin `import()` of `/api/plugins/.../web/entry.js`.
 */
export function installKhirbyPeers(): void {
  window.__KHIRBY__ = {
    Vue,
    VueRouter,
    VueI18n,
    webUi: { AppTable, AppModal, AppSelect, AppDatePicker, useConfirm },
  };
}
