import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '../stores/auth.store';
import { usePluginsStore } from '../stores/plugins.store';
import { pluginComponentMap, pluginChildRoutes } from '../plugins/plugin-registry';

const staticRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/auth/LoginView.vue'),
    // titleKey also feeds the tab title (composables/useDocumentTitle.ts); /login
    // renders outside the app shell, so without it the tab keeps the boot title.
    meta: { public: true, titleKey: 'route.login' },
  },
  {
    path: '/',
    name: 'app',
    component: () => import('../views/layout/AppLayout.vue'),
    children: [
      { path: '', name: 'app-home', redirect: '/contacts' },
      {
        path: 'contacts',
        name: 'contacts',
        component: () => import('../views/contacts/ContactsView.vue'),
        meta: { titleKey: 'nav.workspace.contacts' },
      },
      {
        path: 'contacts/:id',
        name: 'contact-detail',
        component: () => import('../views/contacts/ContactDetailView.vue'),
        meta: {
          titleKey: 'route.contactDetail',
          parent: { labelKey: 'nav.workspace.contacts', to: '/contacts' },
        },
      },
      {
        path: 'pipeline',
        name: 'pipeline',
        component: () => import('../views/pipeline/PipelineView.vue'),
        meta: { titleKey: 'nav.workspace.pipeline' },
      },
      {
        path: 'pipeline/stages',
        name: 'pipeline-stages',
        component: () => import('../views/pipeline/PipelineStagesView.vue'),
        meta: {
          titleKey: 'route.pipelineStages',
          parent: { labelKey: 'nav.workspace.pipeline', to: '/pipeline' },
        },
      },
      {
        path: 'boards/tasks/:taskId',
        name: 'boards-task',
        component: () => import('../views/boards/TaskDetailView.vue'),
        meta: {
          titleKey: 'boards.task.pageTitle',
          parent: { labelKey: 'nav.workspace.boards', to: '/boards/my' },
        },
      },
      {
        path: 'boards',
        name: 'boards',
        component: () => import('../views/boards/BoardsView.vue'),
        meta: { titleKey: 'nav.workspace.boards' },
        children: [
          { path: '', name: 'boards-index', redirect: { name: 'boards-my' } },
          {
            path: 'my',
            name: 'boards-my',
            component: () => import('../views/boards/MyTasksView.vue'),
            meta: { titleKey: 'boards.my.title' },
          },
          {
            path: 'projects/:projectId',
            name: 'boards-project',
            component: () => import('../views/boards/ProjectView.vue'),
            meta: { titleKey: 'nav.workspace.boards' },
          },
          {
            path: 'modules/:moduleId',
            name: 'boards-module',
            component: () => import('../views/boards/ModuleBoardView.vue'),
            meta: { titleKey: 'nav.workspace.boards' },
          },
        ],
      },
      {
        path: 'taskboard/:pathMatch(.*)*',
        redirect: '/boards/my',
      },
      {
        path: 'forms',
        name: 'forms',
        component: () => import('../views/forms/FormsView.vue'),
        meta: { titleKey: 'nav.workspace.forms' },
      },
      {
        path: 'forms/analytics',
        name: 'forms-analytics',
        component: () => import('../views/forms/FormsAnalyticsView.vue'),
        meta: {
          titleKey: 'route.formsAnalytics',
          parent: { labelKey: 'nav.workspace.forms', to: '/forms' },
        },
      },
      {
        path: 'forms/:id',
        name: 'form-detail',
        component: () => import('../views/forms/FormDetailView.vue'),
        meta: {
          titleKey: 'route.formBuilder',
          parent: { labelKey: 'nav.workspace.forms', to: '/forms' },
        },
      },

      {
        path: 'marketplace',
        name: 'marketplace',
        component: () => import('../views/marketplace/MarketplaceView.vue'),
        meta: { titleKey: 'nav.extensions.marketplace' },
      },

      // Settings console — admin area with its own sub-nav (Members/Roles/Plugins moved here)
      {
        path: 'settings',
        component: () => import('../views/settings/SettingsLayout.vue'),
        children: [
          { path: '', name: 'settings-home', redirect: '/settings/general' },
          {
            path: 'general',
            name: 'settings-general',
            component: () => import('../views/settings/SettingsView.vue'),
            meta: {
              titleKey: 'nav.settings.general',
              parent: { labelKey: 'settings.title', to: '/settings' },
            },
          },
          {
            path: 'members',
            name: 'settings-members',
            component: () => import('../views/users/UsersView.vue'),
            meta: {
              titleKey: 'nav.settings.members',
              parent: { labelKey: 'settings.title', to: '/settings' },
            },
          },
          {
            path: 'roles',
            name: 'settings-roles',
            component: () => import('../views/roles/RolesView.vue'),
            meta: {
              titleKey: 'nav.settings.roles',
              parent: { labelKey: 'settings.title', to: '/settings' },
            },
          },
          {
            path: 'integrations',
            name: 'settings-integrations',
            component: () => import('../views/plugins/PluginsView.vue'),
            meta: {
              titleKey: 'nav.settings.integrations',
              parent: { labelKey: 'settings.title', to: '/settings' },
            },
          },
          {
            path: 'mail',
            name: 'settings-mail',
            component: () => import('../views/mail/MailSettingsView.vue'),
            meta: {
              titleKey: 'nav.settings.mail',
              parent: { labelKey: 'settings.title', to: '/settings' },
            },
          },
        ],
      },

      {
        path: 'mail',
        name: 'mail',
        component: () => import('../views/mail/MailInboxView.vue'),
        meta: { titleKey: 'nav.workspace.mail' },
      },

      // Back-compat: the old top-level admin routes now live under Settings
      { path: 'users', redirect: '/settings/members' },
      { path: 'roles', redirect: '/settings/roles' },
      { path: 'plugins', redirect: '/settings/integrations' },
      // Settings-only plugins used to be sidebar pages; config is now inline (ADR-0023)
      { path: 'plugins/mcp', redirect: '/settings/integrations' },
      { path: 'plugins/ai-compose', redirect: '/settings/integrations' },
      { path: 'plugins/pokelo', redirect: '/settings/integrations' },

      {
        path: 'contacts/:id/profile',
        redirect: (to) => ({ name: 'contact-detail', params: to.params }),
      },
      { path: 'forms/:id/builder', redirect: (to) => ({ name: 'form-detail', params: to.params }) },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('../views/NotFoundView.vue'),
    meta: { titleKey: 'route.notFound' },
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes: staticRoutes,
});

/** Nazwy tras dodanych dynamicznie — do usuwania przy disable pluginu */
const registeredPluginRouteNames = new Set<string>();

/** Parent layout route — trasy pluginów muszą być jego dziećmi (relative path). */
const LAYOUT_ROUTE_NAME = 'app';

function toLayoutChildPath(fullPath: string): string {
  return fullPath.replace(/^\//, '');
}

/**
 * Dodaje trasy włączonych pluginów do layoutu.
 * Można wołać wielokrotnie (np. po enable/disable).
 */
export function registerPluginRoutes(
  plugins: Array<{
    name: string;
    enabled: boolean;
    frontendRoutes?: Array<{
      path: string;
      name: string;
      navLabel?: string;
      navLabelKey?: string;
      showInNav?: boolean;
    }>;
  }>,
) {
  const enabledRouteNames = new Set<string>();

  for (const plugin of plugins) {
    if (!plugin.enabled || !plugin.frontendRoutes?.length) continue;
    for (const route of plugin.frontendRoutes) {
      const component = pluginComponentMap[plugin.name];
      if (!component) continue;

      enabledRouteNames.add(route.name);

      if (!router.hasRoute(route.name)) {
        router.addRoute(LAYOUT_ROUTE_NAME, {
          path: toLayoutChildPath(route.path),
          name: route.name,
          component,
          // A plugin screen gets a tab title too: its declared key when the SPA
          // knows it, otherwise the literal the plugin shipped (ADR-0011).
          meta: { titleKey: route.navLabelKey, title: route.navLabel },
          children: pluginChildRoutes[plugin.name] ?? [],
        });
      }
    }
  }

  for (const name of registeredPluginRouteNames) {
    if (!enabledRouteNames.has(name) && router.hasRoute(name)) {
      router.removeRoute(name);
    }
  }

  registeredPluginRouteNames.clear();
  for (const name of enabledRouteNames) {
    registeredPluginRouteNames.add(name);
  }
}

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.checked) {
    await auth.checkSession();
  }
  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'login' };
  }

  if (auth.isAuthenticated) {
    const pluginsStore = usePluginsStore();
    try {
      if (!pluginsStore.plugins.length) {
        await pluginsStore.fetchPlugins();
      }
      registerPluginRoutes(pluginsStore.plugins);
    } catch {
      // Nie blokuj nawigacji gdy API pluginów jest niedostępne
    }

    // Po dynamicznym dodaniu tras — ponów dopasowanie (np. bezpośredni URL /plugins/listmonk)
    if (to.name === 'not-found') {
      const retry = router.resolve(to.fullPath);
      if (retry.name !== 'not-found') {
        return { path: to.fullPath, replace: true };
      }
    }
  }
});
