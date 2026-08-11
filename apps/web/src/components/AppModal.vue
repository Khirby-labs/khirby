<template>
  <DialogRoot :open="true" @update:open="(v: boolean) => !v && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2
               bg-surface-panel border border-border rounded-xl p-6 shadow-2xl
               focus:outline-none"
        @open-auto-focus="handleAutoFocus"
      >
        <DialogTitle v-if="title" class="text-base font-semibold text-text-primary mb-5">
          {{ title }}
        </DialogTitle>
        <DialogTitle v-else class="sr-only">{{ t('common.dialog.fallbackTitle') }}</DialogTitle>
        <DialogDescription v-if="description" class="text-sm text-text-muted mb-4">
          {{ description }}
        </DialogDescription>
        <DialogClose
          class="absolute top-4 right-4 text-text-ghost hover:text-text-secondary transition-colors"
          :aria-label="t('common.actions.close')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </DialogClose>
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
/**
 * App modal on Reka UI Dialog — focus trap, focus restore, Esc, scroll lock
 * and aria wiring come from the primitive (docs/DESIGN-SYSTEM.md §6).
 * Mount/unmount with v-if in the parent, close via @close — same API as before.
 * Prefer passing `title` (renders the heading + labels the dialog); a slot-only
 * body keeps a visually hidden fallback title.
 */
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from 'reka-ui';

defineProps<{ title?: string; description?: string }>();

const { t } = useI18n();

const emit = defineEmits<{ (e: 'close'): void }>();

/** Keep previous behavior: focus the first input if the body has one */
function handleAutoFocus(event: Event) {
  const content = event.currentTarget as HTMLElement | null;
  const firstInput = content?.querySelector<HTMLElement>(
    'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
  );
  if (firstInput) {
    event.preventDefault();
    firstInput.focus();
  }
}
</script>
