import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { initTheme } from './composables/useTheme';
import { initLocale } from './composables/useLocale';
import { i18n } from './i18n';
import './style.css';

initTheme();

// Mount only once the locale bundle has loaded, so the first paint is already in
// the reader's language instead of flashing the English fallback. `finally`, not
// `then`: a failed bundle fetch must still boot the app on the fallback locale.
initLocale().finally(() => {
  const app = createApp(App);
  app.use(createPinia());
  app.use(router);
  app.use(i18n);
  app.mount('#app');
});
