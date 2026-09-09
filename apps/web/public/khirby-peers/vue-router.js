/** Re-exports the host vue-router for plugin ESM (import map → vue-router). */
const r = window.__KHIRBY__.VueRouter;
export default r;
export const useRouter = r.useRouter;
export const useRoute = r.useRoute;
export const useLink = r.useLink;
export const RouterView = r.RouterView;
export const RouterLink = r.RouterLink;
export const createRouter = r.createRouter;
export const createWebHistory = r.createWebHistory;
export const createWebHashHistory = r.createWebHashHistory;
export const createMemoryHistory = r.createMemoryHistory;
export const onBeforeRouteLeave = r.onBeforeRouteLeave;
export const onBeforeRouteUpdate = r.onBeforeRouteUpdate;
