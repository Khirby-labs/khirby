<template>
  <div class="flex flex-col items-center justify-center text-center px-6 py-14 gap-3">
    <div
      v-if="$slots.icon"
      class="flex h-11 w-11 items-center justify-center rounded-full bg-surface-raise2 text-text-muted"
    >
      <slot name="icon" />
    </div>
    <div class="space-y-1">
      <p class="text-sm font-medium text-text-secondary">{{ title }}</p>
      <p v-if="message" class="text-sm text-text-ghost max-w-sm">{{ message }}</p>
    </div>
    <div v-if="$slots.action" class="pt-1">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Empty state — docs/DESIGN-SYSTEM.md §5: a sentence + a primary action, never a bare
 * gray string. Pass a CTA in the `action` slot when the user can create the
 * missing thing; an optional `icon` slot renders in a muted circle.
 */
defineProps<{ title: string; message?: string }>();
</script>
