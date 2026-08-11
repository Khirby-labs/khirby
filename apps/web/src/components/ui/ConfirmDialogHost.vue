<template>
  <AlertDialogRoot :open="state.open" @update:open="(v: boolean) => !v && settle(false)">
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm" />
      <AlertDialogContent
        class="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2
               bg-surface-elevated border border-border rounded-xl p-6 shadow-2xl focus:outline-none"
      >
        <AlertDialogTitle class="text-base font-semibold text-text-primary mb-2">
          {{ state.title }}
        </AlertDialogTitle>
        <AlertDialogDescription class="text-sm text-text-muted mb-5">
          {{ state.message }}
        </AlertDialogDescription>
        <div class="flex justify-end gap-3">
          <AlertDialogCancel class="btn-ghost" @click="settle(false)">
            {{ state.cancelLabel }}
          </AlertDialogCancel>
          <!--
            Plain button — NOT AlertDialogAction. AlertDialogAction wraps DialogClose,
            whose internal @click fires onOpenChange(false) first, resolving the promise
            false before our settle(true) runs (all deletes became silent no-ops). We drive
            the close ourselves via settle(true), which resolves true and sets open=false.
          -->
          <button
            type="button"
            :class="state.danger ? 'btn-danger' : 'btn-primary'"
            @click="settle(true)"
          >
            {{ state.confirmLabel }}
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>

<script setup lang="ts">
/**
 * Single host for useConfirm() — mounted once in App.vue.
 * AlertDialog (not Dialog): no outside-click dismiss, Esc = cancel.
 */
import {
  AlertDialogRoot,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from 'reka-ui';
import { useConfirmState } from '../../composables/useConfirm';

const { state, settle } = useConfirmState();
</script>
