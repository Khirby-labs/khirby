<template>
  <AppTooltip v-if="collapsed" :label="label" side="right">
    <RouterLink v-bind="linkProps" :aria-label="label">
      <span v-if="isActive" :class="activeBar" aria-hidden="true" />
      <NavIcon :name="icon" />
    </RouterLink>
  </AppTooltip>

  <RouterLink v-else v-bind="linkProps">
    <span v-if="isActive" :class="activeBar" aria-hidden="true" />
    <NavIcon :name="icon" />
    <span class="flex-1 truncate">{{ label }}</span>
    <span
      v-if="badge"
      class="ml-auto rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold text-text-muted bg-surface-raise2"
    >
      {{ badge }}
    </span>
  </RouterLink>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import NavIcon from '../NavIcon.vue';
import type { NavIconName } from '../nav-icons';
import AppTooltip from '../ui/AppTooltip.vue';
import { cn } from '../../lib/utils';

const props = defineProps<{
  to: string;
  label: string;
  icon: NavIconName;
  collapsed?: boolean;
  badge?: string | number;
}>();

const route = useRoute();
/** Active when the current path is at or below this link's target. */
const isActive = computed(() => route.path === props.to || route.path.startsWith(props.to + '/'));

const activeBar = 'absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent';

/** Shared RouterLink attrs — layout differs only by collapsed. */
const linkProps = computed(() => ({
  to: props.to,
  class: cn(
    'group relative flex items-center rounded-md text-sm font-medium text-text-muted',
    'transition-colors duration-150 hover:bg-surface-raise hover:text-text-primary',
    props.collapsed ? 'h-9 w-9 justify-center' : 'h-9 gap-3 px-2.5',
  ),
  activeClass: '!text-text-primary bg-surface-raise2',
}));
</script>
