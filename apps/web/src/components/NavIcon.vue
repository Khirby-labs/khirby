<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="h-4 w-4 flex-shrink-0"
    aria-hidden="true"
    v-html="ICON_PATHS[name]"
  />
</template>

<script setup lang="ts">
import { ICON_PATHS, type NavIconName } from './nav-icons';

defineProps<{ name: NavIconName }>();
</script>
