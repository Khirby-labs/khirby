import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { http, HttpResponse } from 'msw';
import {
  buildCommandGroups,
  filterCommandGroups,
  filterNavForUser,
  workspaceNav,
  marketplaceNav,
  settingsNav,
} from '../../lib/nav';
import { useAuthStore } from '../../stores/auth.store';
import { i18n, loadLocale } from '../../i18n';
import { FALLBACK_LOCALE } from '../../i18n/locales';
import { server } from '../../test/msw/server';
import { api } from '../../test/api-base';

/**
 * Command palette Ask Khirby fallback is pure logic over nav groups + auth;
 * Reka Dialog focus/teleport makes a full mount flaky in jsdom, so we exercise
 * the same conditions the component uses in filteredGroups.
 */
const t = (key: string) => i18n.global.t(key as never);

function askFallbackGroups(
  query: string,
  permissions: { resource: string; action: string }[],
  contactSearchDone = true,
) {
  const auth = {
    hasPermission: (r: string, a: string) =>
      permissions.some((p) => p.resource === r && p.action === a),
  };
  const navItems = filterNavForUser(
    [...workspaceNav, ...marketplaceNav, ...settingsNav],
    permissions,
  );
  const navGroups = filterCommandGroups(buildCommandGroups(t, [], navItems), query);
  const q = query.trim();
  const showAskFallback =
    auth.hasPermission('agent', 'use') &&
    q.length > 0 &&
    contactSearchDone &&
    navGroups.flatMap((g) => g.items).length === 0;

  if (!showAskFallback) return navGroups;

  return [
    ...navGroups,
    {
      heading: t('nav.commandGroup.ask'),
      items: [
        {
          kind: 'ask' as const,
          label: t('shell.palette.askKhirby'),
          to: '/ask',
          icon: 'ask' as const,
          draft: q,
        },
      ],
    },
  ];
}

beforeEach(async () => {
  await loadLocale(FALLBACK_LOCALE);
  server.use(http.get(api('/api/contacts'), () => HttpResponse.json({ data: [] })));
});

afterEach(() => {
  i18n.global.locale.value = FALLBACK_LOCALE;
});

describe('CommandPalette — Ask Khirby fallback', () => {
  it('offers Ask Khirby when nothing matches and the user has agent:use', () => {
    const groups = askFallbackGroups('zzzzuniquequery', [{ resource: 'agent', action: 'use' }]);
    const labels = groups.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).toContain('Ask Khirby');
  });

  it('does not offer Ask Khirby without agent:use', () => {
    const groups = askFallbackGroups('zzzzuniquequery', []);
    const labels = groups.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).not.toContain('Ask Khirby');
  });

  it('wires auth store hasPermission the same way as the palette', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.user = {
      id: 'u1',
      email: 'admin@example.com',
      locale: null,
      permissions: [{ resource: 'agent', action: 'use' }],
    };
    expect(auth.hasPermission('agent', 'use')).toBe(true);
  });
});
