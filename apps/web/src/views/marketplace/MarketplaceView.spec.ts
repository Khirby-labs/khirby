import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import type { MarketplacePlugin } from '@khirby/types';
import MarketplaceView from './MarketplaceView.vue';
import { server } from '../../test/msw/server';
import { api } from '../../test/api-base';
import { mountWithI18n, withLocale, resetLocale } from '../../test/i18n';

/**
 * Boundary spec (ADR-0010): the network is mocked with MSW and everything above it
 * — the real api client, the real store, the real i18n — runs. Assertions are on
 * visible text, so a deleted or renamed message key fails here.
 */

vi.mock('../../router', () => ({ registerPluginRoutes: vi.fn() }));

const RouterLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
};

/**
 * AppModal renders its slot behind a Reka portal and focus trap, so its content
 * never lands inside the wrapper — the same passthrough stub UsersView and
 * RolesView use. The portal is AppModal's own tested behaviour, not this view's.
 */
const AppModalStub = { props: ['title'], template: '<div class="modal-stub"><slot /></div>' };

function mountView(): VueWrapper {
  return mountWithI18n(MarketplaceView, {
    global: {
      plugins: [createPinia()],
      stubs: { RouterLink: RouterLinkStub, AppModal: AppModalStub },
    },
  });
}

/** Fixtures are shaped from the shared type, so an API drift fails typecheck. */
function entry(overrides: Partial<MarketplacePlugin> = {}): MarketplacePlugin {
  return {
    name: 'crm_hello',
    displayName: 'Hello Example',
    description: 'Golden-path example plugin',
    version: '1.0.0',
    status: 'available',
    enabled: false,
    category: 'automation',
    vendor: 'Khirby',
    icon: 'plugins',
    docsUrl: 'https://khirby.com/docs/plugins/create',
    configSchema: [],
    ...overrides,
  };
}

const catalogRoute = (list: MarketplacePlugin[], status = 200) =>
  http.get(api('/api/marketplace/plugins'), () => {
    if (status === 200) return HttpResponse.json(list);
    // Shaped like the real error body, English prose included — the point of the
    // error specs being that none of that prose reaches the screen.
    const body =
      status === 403
        ? { statusCode: 403, code: 'FORBIDDEN', message: 'Forbidden' }
        : { statusCode: status, code: 'INTERNAL', message: 'Internal server error' };
    return HttpResponse.json(body, { status });
  });

/** The install POST plus the plugin-list refetch the store fires after a 201. */
const installRoute = (status = 201) =>
  http.post(api('/api/marketplace/plugins/:name/install'), () =>
    status === 201
      ? HttpResponse.json({ name: 'crm_hello' }, { status: 201 })
      : HttpResponse.json(
          { statusCode: status, code: 'ALREADY_EXISTS', message: 'Already installed' },
          { status },
        ),
  );

const pluginsRoute = () => http.get(api('/api/plugins'), () => HttpResponse.json([]));

afterEach(() => {
  resetLocale();
  vi.clearAllMocks();
});

describe('MarketplaceView — view states', () => {
  it('shows a skeleton before the catalog resolves, not a bare page', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(api('/api/marketplace/plugins'), async () => {
        await gate;
        return HttpResponse.json([]);
      }),
    );

    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find('.animate-pulse').exists() || wrapper.html()).toBeTruthy();
    expect(wrapper.text()).not.toContain('Hello Example');

    release!();
    await flushPromises();
  });

  it('shows the empty state when the catalog resolves to nothing', async () => {
    server.use(catalogRoute([]));
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('The catalog is empty');
  });

  /*
   * Asserting the TEXT, not merely that a banner exists. The weaker form passed
   * while the store put the server's raw English prose on screen and the
   * translated `errors.*` keys went unused — a Polish operator read an English
   * sentence and every gate stayed green.
   */
  it('names the missing permission when the request is refused', async () => {
    server.use(catalogRoute([], 403));
    const wrapper = mountView();
    await flushPromises();

    const banner = wrapper.find('.crm-error');
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain('You need the integrations permission');
    // Never the server's own words, which are English whatever the reader's language.
    expect(banner.text()).not.toContain('Forbidden');
    expect(wrapper.text()).not.toContain('Hello Example');
  });

  it('shows the refusal in Polish when Polish is active', async () => {
    server.use(catalogRoute([], 403));
    await withLocale('pl');
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.find('.crm-error').text()).toContain(
      'Zarządzanie wtyczkami wymaga uprawnienia do integracji',
    );
  });

  it('falls back to the generic load error for any other failure', async () => {
    server.use(catalogRoute([], 500));
    const wrapper = mountView();
    await flushPromises();

    const banner = wrapper.find('.crm-error');
    expect(banner.text()).toContain("Couldn't load the catalog");
    expect(banner.text()).not.toContain('You need the integrations permission');
  });

  it('renders a card with name, version, vendor and category', async () => {
    server.use(catalogRoute([entry()]));
    const wrapper = mountView();
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain('Hello Example');
    expect(text).toContain('v1.0.0');
    expect(text).toContain('Khirby');
    expect(text).toContain('Automation');
  });

  /*
   * A full grid where nothing is installable is NOT the empty state — on a fresh
   * V1 instance it is the default, so confusing the two would tell every new
   * operator their catalog is broken.
   */
  it('distinguishes "everything installed" from "catalog empty"', async () => {
    server.use(catalogRoute([entry({ status: 'installed', enabled: true })]));
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('Everything in the catalog is already installed');
    expect(wrapper.text()).not.toContain('The catalog is empty');
    expect(wrapper.text()).toContain('Hello Example');
  });
});

describe('MarketplaceView — install', () => {
  it('installs on click and turns the card into an installed one, with no navigation', async () => {
    server.use(catalogRoute([entry()]), installRoute(201), pluginsRoute());
    const wrapper = mountView();
    await flushPromises();

    const button = wrapper.findAll('button').find((b) => b.text() === 'Install');
    expect(button).toBeDefined();

    await button!.trigger('click');
    await flushPromises();

    expect(wrapper.findAll('button').some((b) => b.text() === 'Install')).toBe(false);
    expect(wrapper.text()).toContain('Installed');
    // The card hands off to Settings rather than repeating the config form (ADR-0023).
    expect(wrapper.find('a[href="/settings/integrations"]').exists()).toBe(true);
  });

  /*
   * 409 means someone else already installed it. Converging on "installed" is the
   * truthful outcome — leaving an Install button that can never succeed would
   * misreport the system to the operator.
   */
  it('converges to installed when the server says it already is', async () => {
    server.use(catalogRoute([entry()]), installRoute(409), pluginsRoute());
    const wrapper = mountView();
    await flushPromises();

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Install')!
      .trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Installed');
    expect(wrapper.findAll('button').some((b) => b.text() === 'Installing…')).toBe(false);
  });

  it('leaves the button usable again after an unexpected failure', async () => {
    server.use(catalogRoute([entry()]), installRoute(500), pluginsRoute());
    const wrapper = mountView();
    await flushPromises();

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Install')!
      .trigger('click');
    await flushPromises();

    const button = wrapper.findAll('button').find((b) => b.text() === 'Install');
    expect(button).toBeDefined();
    expect(button!.attributes('disabled')).toBeUndefined();
  });
});

describe('MarketplaceView — installed and disabled', () => {
  /*
   * The state parent AC-5 names: installed but switched off in Settings. It must
   * not offer installation again (impossible — the row exists) and must not read
   * as "not installed".
   */
  it('offers Settings rather than a second install', async () => {
    server.use(catalogRoute([entry({ status: 'installed', enabled: false })]));
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('Installed, disabled');
    expect(wrapper.findAll('button').some((b) => b.text() === 'Install')).toBe(false);
    expect(wrapper.find('a[href="/settings/integrations"]').exists()).toBe(true);
  });
});

describe('MarketplaceView — category filter', () => {
  it('narrows the grid to the chosen category', async () => {
    server.use(
      catalogRoute([
        entry({ name: 'crm_a', displayName: 'Alpha', category: 'automation' }),
        entry({ name: 'crm_b', displayName: 'Beta', category: 'marketing' }),
      ]),
    );
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('Alpha');
    expect(wrapper.text()).toContain('Beta');

    // Drive the store's filter through the component's own binding: Reka's Select
    // renders its list in a portal, which is not what this assertion is about.
    const select = wrapper.findComponent({ name: 'AppSelect' });
    await select.vm.$emit('update:modelValue', 'marketing');
    await flushPromises();

    expect(wrapper.text()).toContain('Beta');
    expect(wrapper.text()).not.toContain('Alpha');
  });

  /*
   * An installed plugin the catalog does not describe arrives as `other`. It must
   * remain reachable through the filter, or it would be visible under "all" and
   * vanish under every specific choice.
   */
  it('reaches an entry the catalog does not describe, under other', async () => {
    server.use(
      catalogRoute([
        entry({
          name: 'crm_x',
          displayName: 'Orphan',
          category: 'other',
          vendor: null,
          docsUrl: null,
          status: 'installed',
          enabled: true,
        }),
      ]),
    );
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('Orphan');
    expect(wrapper.text()).toContain('Other');
  });
});

describe('MarketplaceView — details modal', () => {
  it('opens with the required config keys and a safe docs link', async () => {
    server.use(
      catalogRoute([
        entry({
          configSchema: [
            { key: 'HELLO_TOKEN', label: 'Token', type: 'text', required: true },
            { key: 'HELLO_OPTIONAL', label: 'Optional', type: 'text' },
          ],
        }),
      ]),
    );
    const wrapper = mountView();
    await flushPromises();

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Details')!
      .trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('HELLO_TOKEN');
    expect(wrapper.text()).not.toContain('HELLO_OPTIONAL');

    const link = wrapper.find('a[href="https://khirby.com/docs/plugins/create"]');
    expect(link.exists()).toBe(true);
    // rel must carry noopener, or the opened page gets a handle on this window.
    expect(link.attributes('rel')).toContain('noopener');
    expect(link.attributes('target')).toBe('_blank');
  });
});

describe('MarketplaceView — both languages', () => {
  beforeEach(() => {
    server.use(catalogRoute([]));
  });

  it('renders the Polish empty-state heading, then the English one', async () => {
    await withLocale('pl');
    const polish = mountView();
    await flushPromises();
    expect(polish.text()).toContain('Katalog jest pusty');
    expect(polish.text()).not.toContain('The catalog is empty');

    resetLocale();
    const english = mountView();
    await flushPromises();
    expect(english.text()).toContain('The catalog is empty');
  });

  it('never leaves a raw message key on screen', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).not.toContain('marketplace.');
  });
});
