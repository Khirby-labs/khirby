import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import ContactsView from './ContactsView.vue';
import ConfirmDialogHost from '../../components/ui/ConfirmDialogHost.vue';
import { server } from '../../test/msw/server';
import { api } from '../../test/api-base';
import { mountWithI18n, withLocale, resetLocale } from '../../test/i18n';

/**
 * Boundary spec: real view, real store, real i18n, network mocked with MSW.
 *
 * The delete path is the reason this file exists. It used to be a hand-rolled
 * modal; it now goes through `useConfirm`, and a silently-broken confirm made
 * every destructive action a no-op once before in this repo (INCIDENTS.md,
 * 2026-07-24). Only a spec that drives the real dialog would notice.
 */
const contact = {
  id: 'c1',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  createdAt: '2026-07-24T10:30:00.000Z',
};

function listResponds(rows = [contact], total = rows.length) {
  return http.get(api('/api/contacts'), () =>
    HttpResponse.json({ data: rows, total, page: 1, pageSize: 20 }),
  );
}

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/contacts' },
      { path: '/contacts', name: 'contacts', component: { template: '<div />' } },
      { path: '/contacts/:id', name: 'contact-detail', component: { template: '<div />' } },
    ],
  });
}

let view: VueWrapper;
let confirmHost: VueWrapper | null = null;

async function mountContacts(): Promise<VueWrapper> {
  const router = makeRouter();
  router.push('/contacts');
  await router.isReady();

  view = mountWithI18n(ContactsView, {
    global: { plugins: [createPinia(), router] },
    attachTo: document.body,
  });
  await flushPromises();
  return view;
}

/** Mounted separately, as in useConfirm.spec.ts — the confirm state is module-level. */
function mountConfirmHost(): void {
  confirmHost = mountWithI18n(ConfirmDialogHost, { attachTo: document.body });
}

const buttonByText = (text: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as
    HTMLButtonElement | undefined;

describe('ContactsView', () => {
  beforeEach(() => {
    // <PageActions> teleports into the top bar, which the shell owns.
    const target = document.createElement('div');
    target.id = 'topbar-actions';
    document.body.appendChild(target);

    server.use(
      listResponds(),
      http.get(api('/api/plugins'), () => HttpResponse.json([])),
      http.get(api('/api/forms'), () => HttpResponse.json([])),
    );
  });

  afterEach(() => {
    confirmHost?.unmount();
    confirmHost = null;
    view?.unmount();
    resetLocale();
    document.body.innerHTML = '';
  });

  it('lists contacts with a locale-formatted date', async () => {
    const wrapper = await mountContacts();

    expect(wrapper.text()).toContain('ada@example.com');
    // 'en-US' used to be hardcoded in the view; the named format follows the locale.
    expect(wrapper.text()).toMatch(/24 Jul 2026|Jul 24, 2026/);
  });

  it('offers an empty state naming both ways to get contacts in', async () => {
    server.use(listResponds([], 0));
    const wrapper = await mountContacts();

    expect(wrapper.text()).toContain('No contacts');
    expect(wrapper.text()).toContain('Listmonk');
  });

  it('deletes only after the confirmation is accepted', async () => {
    let deleted = 0;
    server.use(
      http.delete(api('/api/contacts/c1'), () => {
        deleted++;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await mountContacts();
    mountConfirmHost();

    buttonByText('Delete')!.click();
    await nextTick();
    await nextTick();

    // The dialog names the object, never a bare "OK".
    expect(document.body.textContent).toContain('Delete contact?');
    expect(document.body.textContent).toContain('Ada Lovelace');
    expect(deleted).toBe(0);

    buttonByText('Delete contact')!.click();
    await flushPromises();

    expect(deleted).toBe(1);
  });

  it('leaves the contact alone when the confirmation is dismissed', async () => {
    let deleted = 0;
    server.use(
      http.delete(api('/api/contacts/c1'), () => {
        deleted++;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await mountContacts();
    mountConfirmHost();

    buttonByText('Delete')!.click();
    await nextTick();
    await nextTick();

    buttonByText('Cancel')!.click();
    await flushPromises();

    expect(deleted).toBe(0);
  });

  it('renders the whole page in Polish when Polish is active', async () => {
    await withLocale('pl');
    const wrapper = await mountContacts();

    expect(wrapper.text()).toContain('Kontakty');
    expect(wrapper.text()).toContain('Telefon');
    expect(wrapper.text()).not.toContain('Search…');
  });
});
