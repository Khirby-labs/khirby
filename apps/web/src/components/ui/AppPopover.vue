<template>
  <PopoverRoot :open="open" @update:open="(v) => emit('update:open', v)">
    <PopoverTrigger as-child>
      <slot name="trigger" />
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        :side="side ?? 'bottom'"
        :align="align ?? 'start'"
        :side-offset="sideOffset ?? 4"
        :collision-padding="8"
        :class="
          cn(
            'z-[70] rounded-lg border border-border bg-surface-elevated shadow-2xl focus:outline-none',
            contentClass,
          )
        "
      >
        <slot />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<script setup lang="ts">
/**
 * Token-styled popover on Reka UI (docs/DESIGN-SYSTEM.md §6) — the shared base for
 * anchored panels, so the next one doesn't re-derive the surface/border/z-index.
 *
 * Surface matches `AppSelect`'s dropdown (`surface-elevated`, `border-border`,
 * `shadow-2xl`, `z-[70]`): an anchored panel is an anchored panel, whichever
 * primitive opened it.
 *
 * `open` is optional. Omit it and Reka owns the state; bind it when the parent has
 * to close the panel itself (picking a preset, committing a range).
 */
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent } from 'reka-ui';
import { cn } from '../../lib/utils';

defineProps<{
  open?: boolean;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  contentClass?: string;
}>();

const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>();
</script>
