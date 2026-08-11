import type { NavIconName } from '../components/nav-icons';

/**
 * Single source of truth for the app's navigation model.
 * Consumed by the sidebar, the command palette (⌘K), and the Settings console
 * sub-nav — so a destination is declared once and appears everywhere in sync.
 *
 * These are module-level constants, evaluated at import — before
 * `app.use(i18n)`. They therefore carry message KEYS, never copy: a `t()` call
 * here would return the key and freeze every label at the boot locale
 * (`.claude/rules/i18n.md`). Consumers translate at render.
 */
export interface NavItem {
  to: string;
  /** Route name — used to resolve the top-bar title and active state. */
  name: string;
  labelKey: string;
  icon: NavIconName;
}

/** Daily work — the operational surfaces, top of the sidebar. */
export const workspaceNav: NavItem[] = [
  { to: '/contacts', name: 'contacts', labelKey: 'nav.workspace.contacts', icon: 'contacts' },
  { to: '/pipeline', name: 'pipeline', labelKey: 'nav.workspace.pipeline', icon: 'pipeline' },
  { to: '/boards', name: 'boards', labelKey: 'nav.workspace.boards', icon: 'boards' },
  { to: '/forms', name: 'forms', labelKey: 'nav.workspace.forms', icon: 'forms' },
  { to: '/mail', name: 'mail', labelKey: 'nav.workspace.mail', icon: 'mail' },
];

/** Administration — lives inside the Settings console, not the main list. */
export const settingsNav: NavItem[] = [
  {
    to: '/settings/general',
    name: 'settings-general',
    labelKey: 'nav.settings.general',
    icon: 'settings',
  },
  {
    to: '/settings/members',
    name: 'settings-members',
    labelKey: 'nav.settings.members',
    icon: 'users',
  },
  { to: '/settings/roles', name: 'settings-roles', labelKey: 'nav.settings.roles', icon: 'roles' },
  {
    to: '/settings/integrations',
    name: 'settings-integrations',
    labelKey: 'nav.settings.integrations',
    icon: 'plugins',
  },
  {
    to: '/settings/mail',
    name: 'settings-mail',
    labelKey: 'nav.settings.mail',
    icon: 'mail',
  },
];

export interface QuickCreateAction {
  labelKey: string;
  /** Target route; the view opens its create dialog when `?new=1` is present. */
  to: string;
  icon: NavIconName;
}

/** "+ New" menu and command-palette create actions (CRM is create-heavy). */
export const quickCreateActions: QuickCreateAction[] = [
  { labelKey: 'nav.quickCreate.contact', to: '/contacts?new=1', icon: 'contacts' },
  { labelKey: 'nav.quickCreate.lead', to: '/pipeline?new=1', icon: 'pipeline' },
  { labelKey: 'nav.quickCreate.form', to: '/forms?new=1', icon: 'forms' },
];

/**
 * A palette entry with its label already resolved. Labels reach this stage as
 * text — either translated from a `labelKey`, or straight from the API in the
 * case of plugin routes, which the SPA cannot localize.
 */
export interface CommandItem {
  kind: 'nav' | 'create' | 'contact';
  label: string;
  to: string;
  icon: NavIconName;
  /** Optional secondary line (e.g. email under contact name). */
  detail?: string;
}

export interface CommandGroup {
  heading: string;
  items: CommandItem[];
}

/** Translate function — `t` from `useI18n()`, passed in so this file stays pure. */
export type Translate = (key: string) => string;

/**
 * All command-palette entries, grouped, with every label already translated.
 * `pluginItems` are the enabled plugin routes (already text).
 *
 * Labels are resolved HERE rather than at render because `filterCommandGroups`
 * matches on them: filtering key strings would silently stop matching what the
 * user actually sees, and no existing test would have noticed.
 */
export function buildCommandGroups(t: Translate, pluginItems: CommandItem[]): CommandGroup[] {
  return [
    {
      heading: t('nav.commandGroup.navigate'),
      items: [...workspaceNav, ...settingsNav].map((n) => ({
        kind: 'nav',
        label: t(n.labelKey),
        to: n.to,
        icon: n.icon,
      })),
    },
    { heading: t('nav.commandGroup.plugins'), items: pluginItems },
    {
      heading: t('nav.commandGroup.create'),
      items: quickCreateActions.map((a) => ({
        kind: 'create',
        label: t(a.labelKey),
        to: a.to,
        icon: a.icon,
      })),
    },
  ];
}

/**
 * Case-insensitive substring filter over the VISIBLE label; drops empty groups.
 * Empty query keeps everything. Locale-aware casing: `toLocaleLowerCase` matters
 * the moment labels stop being ASCII.
 */
export function filterCommandGroups(groups: CommandGroup[], query: string): CommandGroup[] {
  const q = query.trim().toLocaleLowerCase();
  return groups
    .map((g) => ({
      heading: g.heading,
      items: q ? g.items.filter((it) => it.label.toLocaleLowerCase().includes(q)) : g.items,
    }))
    .filter((g) => g.items.length > 0);
}
