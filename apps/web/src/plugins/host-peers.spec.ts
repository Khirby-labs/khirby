import { describe, expect, it } from 'vitest';
import html from '../../index.html?raw';
import shim from '../../public/khirby-peers/khirby-web-api.js?raw';
import { apiGet } from '../api/client';
import { installKhirbyPeers } from './host-peers';

/** Specifiers `vite.web.config.ts` leaves external on volume plugin bundles. */
const VOLUME_WEB_EXTERNALS = [
  'vue',
  'vue-router',
  'vue-i18n',
  '@khirby/web-api',
  '@khirby/web-ui',
  '@khirby/web-ui/AppTable',
  '@khirby/web-ui/AppModal',
  '@khirby/web-ui/AppSelect',
  '@khirby/web-ui/AppDatePicker',
  '@khirby/web-ui/useConfirm',
];

describe('host peers (ADR-0043)', () => {
  it('exposes the API client Listmonk (and other volume Vue) bundles import', () => {
    installKhirbyPeers();
    expect(window.__KHIRBY__?.webApi.apiGet).toBe(apiGet);
    expect(typeof window.__KHIRBY__?.webApi.apiPut).toBe('function');
  });

  it('import map lists every specifier volume plugins leave external', () => {
    for (const spec of VOLUME_WEB_EXTERNALS) {
      expect(html).toContain(`"${spec}"`);
    }
    expect(html).toContain('/khirby-peers/khirby-web-api.js');
  });

  it('web-api shim re-exports named helpers from window.__KHIRBY__.webApi', () => {
    expect(shim).toContain('window.__KHIRBY__.webApi');
    expect(shim).toContain('export const apiGet');
    expect(shim).toContain('export const apiPut');
  });
});
