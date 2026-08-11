<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger
      class="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-semibold text-accent-ink
             transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-panel"
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
      {{ t('shell.actions.new') }}
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        align="end"
        :side-offset="8"
        class="z-[75] min-w-[12rem] rounded-lg border border-border bg-surface-elevated p-1.5 shadow-2xl focus:outline-none"
      >
        <DropdownMenuItem
          v-for="action in quickCreateActions"
          :key="action.to"
          class="flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-text-secondary
                 outline-none data-[highlighted]:bg-surface-raise data-[highlighted]:text-text-primary"
          @select="() => router.push(action.to)"
        >
          <NavIcon :name="action.icon" />
          {{ t(action.labelKey) }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup lang="ts">
/**
 * Top-bar "+ New" — a create-anywhere menu for a create-heavy CRM. Each action
 * routes to the owning view with `?new=1`; the view opens its create dialog.
 */
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  DropdownMenuRoot, DropdownMenuTrigger, DropdownMenuPortal, DropdownMenuContent, DropdownMenuItem,
} from 'reka-ui';
import NavIcon from '../NavIcon.vue';
import { quickCreateActions } from '../../lib/nav';

const { t } = useI18n();
const router = useRouter();
</script>
