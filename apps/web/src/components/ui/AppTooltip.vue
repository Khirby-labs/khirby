<template>
  <TooltipRoot :delay-duration="300">
    <TooltipTrigger as-child>
      <slot />
    </TooltipTrigger>
    <TooltipPortal>
      <TooltipContent
        :side="side"
        :side-offset="6"
        class="z-[80] max-w-xs rounded-md bg-surface-elevated border border-border px-2.5 py-1.5
               text-xs text-text-secondary shadow-xl select-none
               data-[state=delayed-open]:animate-in"
      >
        {{ label }}
        <TooltipArrow class="fill-surface-elevated" />
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>

<script setup lang="ts">
/**
 * Token-styled tooltip on Reka UI (docs/DESIGN-SYSTEM.md §6). Wrap an icon-only
 * control: <AppTooltip label="Move up"><button …/></AppTooltip>.
 * The trigger still needs its own aria-label — a tooltip is not an accessible name.
 * Requires <TooltipProvider> mounted once at the app root.
 */
import {
  TooltipRoot, TooltipTrigger, TooltipPortal, TooltipContent, TooltipArrow,
} from 'reka-ui';

withDefaults(
  defineProps<{ label: string; side?: 'top' | 'right' | 'bottom' | 'left' }>(),
  { side: 'top' },
);
</script>
