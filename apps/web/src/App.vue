<template>
  <TooltipProvider>
    <RouterView />
  </TooltipProvider>
  <AppToast />
  <ConfirmDialogHost />
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
import { TooltipProvider } from 'reka-ui';
import AppToast from './components/AppToast.vue';
import ConfirmDialogHost from './components/ui/ConfirmDialogHost.vue';
import { useDocumentTitle } from './composables/useDocumentTitle';

// Here rather than in the app shell: /login and /404 render outside it and would
// otherwise keep the boot title forever.
useDocumentTitle();
</script>
