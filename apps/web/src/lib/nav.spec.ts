import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import {
  buildCommandGroups,
  filterCommandGroups,
  workspaceNav,
  marketplaceNav,
  settingsNav,
  quickCreateActions,
  type CommandItem,
} from './nav';
import { i18n, loadLocale } from '../i18n';
import { FALLBACK_LOCALE } from '../i18n/locales';

/**
 * Pure functions over the nav registry, exercised with the REAL translate
 * function so the assertions are resolved copy — what the user sees — rather
 * than message keys (ADR-0010, `.claude/rules/i18n.md`).
 */
const t = (key: string) => i18n.global.t(key as never);

/** Plugin routes arrive from the API already as text; the SPA cannot localize them. */
const pluginItems: CommandItem[] = [
  { kind: 'nav', label: 'Newsletter', to: '/plugins/listmonk', icon: 'plugins' },
];

beforeAll(async () => {
  await loadLocale('pl');
});

afterEach(() => {
  i18n.global.locale.value = FALLBACK_LOCALE;
});

describe('buildCommandGroups', () => {
  it('groups navigate / plugins / create with translated headings', () => {
    const groups = buildCommandGroups(t, pluginItems);
    expect(groups.map((g) => g.heading)).toEqual(['Navigate', 'Plugins', 'Create']);

    const navigate = groups[0].items;
    expect(navigate).toHaveLength(workspaceNav.length + marketplaceNav.length + settingsNav.length);
    expect(navigate.every((i) => i.kind === 'nav')).toBe(true);

    expect(groups[1].items).toEqual(pluginItems);

    const create = groups[2].items;
    expect(create).toHaveLength(quickCreateActions.length);
    expect(create.every((i) => i.kind === 'create')).toBe(true);
  });

  it('resolves every label to copy, never leaving a key on screen', () => {
    const labels = buildCommandGroups(t, []).flatMap((g) => g.items.map((i) => i.label));
    expect(labels).toContain('Contacts');
    expect(labels).toContain('New contact');
    expect(labels.some((l) => l.includes('nav.'))).toBe(false);
  });

  it('keeps admin (Members/Roles/Plugins) as navigate entries, not top-level', () => {
    const navigate = buildCommandGroups(t, [])[0].items;
    expect(navigate.map((i) => i.to)).toContain('/settings/members');
    expect(navigate.map((i) => i.to)).toContain('/settings/roles');
    expect(navigate.map((i) => i.to)).toContain('/settings/integrations');
  });

  /*
   * The regression guard the Marketplace section needs. `nav.ts` has no concept of
   * a sidebar group — sections are written out in AppSidebar.vue — so a new nav
   * section can render perfectly in the sidebar and be missing from ⌘K, and before
   * this assertion nothing would have failed: the count above was exactly
   * workspaceNav + settingsNav.
   */
  it('carries Marketplace into the palette, resolved in both languages', () => {
    const labels = () => buildCommandGroups(t, [])[0].items.map((i) => i.label);
    const targets = () => buildCommandGroups(t, [])[0].items.map((i) => i.to);

    expect(targets()).toContain('/marketplace');
    expect(labels()).toContain('Marketplace');

    i18n.global.locale.value = 'pl';
    expect(targets()).toContain('/marketplace');
    // Established in Polish too, so the word itself does not change — what matters
    // is that it resolves to copy rather than to a key.
    expect(labels()).toContain('Marketplace');
    expect(labels().some((l) => l.includes('nav.'))).toBe(false);
  });

  it('follows the active locale', () => {
    i18n.global.locale.value = 'pl';
    const groups = buildCommandGroups(t, []);
    expect(groups[0].items.map((i) => i.label)).toContain('Kontakty');
    expect(groups[0].heading).not.toBe('Navigate');
  });
});

describe('filterCommandGroups', () => {
  it('returns every group unchanged for an empty query', () => {
    const groups = buildCommandGroups(t, pluginItems);
    expect(filterCommandGroups(groups, '   ')).toEqual(groups);
  });

  it('matches case-insensitively on the label and drops empty groups', () => {
    const result = filterCommandGroups(buildCommandGroups(t, pluginItems), 'CONTACT');
    const labels = result.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).toContain('Contacts');
    expect(labels).toContain('New contact');
    // No admin/plugin labels contain "contact", so those groups vanish.
    expect(result.map((g) => g.heading)).not.toContain('Plugins');
  });

  it('returns nothing when no label matches', () => {
    expect(filterCommandGroups(buildCommandGroups(t, pluginItems), 'zzzznope')).toEqual([]);
  });

  /*
   * The regression this rewrite exists to prevent: filtering runs over whatever
   * `label` holds. Had the labels stayed keys instead of being resolved in
   * buildCommandGroups, ⌘K would have silently started matching
   * "nav.workspace.contacts" and stopped matching what the user reads — and no
   * previous assertion would have failed.
   */
  it('searches what the user sees, not the message key', () => {
    const groups = buildCommandGroups(t, []);
    expect(filterCommandGroups(groups, 'nav.workspace')).toEqual([]);
  });

  it('searches Polish labels when Polish is active', () => {
    i18n.global.locale.value = 'pl';
    const groups = buildCommandGroups(t, []);

    const hits = filterCommandGroups(groups, 'kontakt').flatMap((g) => g.items.map((i) => i.label));
    expect(hits).toContain('Kontakty');
    // The English word is not present in the Polish UI, so it must not match.
    expect(filterCommandGroups(groups, 'contacts')).toEqual([]);
  });
});
