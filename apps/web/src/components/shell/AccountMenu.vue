<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger
      :class="
        cn(
          'group flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors',
          'hover:bg-surface-raise focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          collapsed && 'justify-center',
        )
      "
      :aria-label="t('shell.account.trigger', { email })"
    >
      <span
        class="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full border border-border-strong bg-surface-elevated font-mono text-[11px] text-text-secondary"
      >
        {{ initials }}
      </span>
      <span v-if="!collapsed" class="min-w-0 flex-1">
        <span class="block truncate font-mono text-xs text-text-secondary">{{ email }}</span>
      </span>
      <svg
        v-if="!collapsed"
        class="h-4 w-4 flex-shrink-0 text-text-ghost"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
        side="top"
        align="start"
        :side-offset="8"
        class="z-[75] min-w-[15rem] rounded-lg border border-border bg-surface-elevated p-1.5 shadow-2xl focus:outline-none"
      >
        <DropdownMenuLabel class="truncate px-2.5 py-1.5 font-mono text-xs text-text-muted">
          {{ email }}
        </DropdownMenuLabel>
        <DropdownMenuSeparator class="my-1 h-px bg-border-subtle" />

        <DropdownMenuItem :class="itemClass" @select="go('/settings/general')">
          <NavIcon name="settings" />
          {{ t('settings.title') }}
        </DropdownMenuItem>

        <DropdownMenuSeparator class="my-1 h-px bg-border-subtle" />
        <DropdownMenuLabel
          class="px-2.5 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-wider text-text-ghost"
        >
          {{ t('settings.appearance.themeLabel') }}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          :model-value="preference"
          @update:model-value="(v) => setPreference(v as ThemePreference)"
        >
          <DropdownMenuRadioItem
            v-for="opt in themeOptions"
            :key="opt.value"
            :value="opt.value"
            :class="itemClass"
          >
            <svg
              class="h-4 w-4 flex-shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              v-html="opt.icon"
            />
            <span class="flex-1">{{ t(opt.labelKey) }}</span>
            <DropdownMenuItemIndicator class="text-accent">
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </DropdownMenuItemIndicator>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator class="my-1 h-px bg-border-subtle" />
        <DropdownMenuItem
          :class="cn(itemClass, 'text-danger data-[highlighted]:text-danger')"
          @select="handleLogout"
        >
          <svg
            class="h-4 w-4 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
          {{ t('shell.account.logOut') }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup lang="ts">
/**
 * Sidebar-footer account menu (Reka DropdownMenu). Replaces the plain
 * e-mail + "Sign out" text: avatar + e-mail trigger opening Settings, a theme
 * radio group, and Log out. `collapsed` renders the avatar-only rail variant.
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItemIndicator,
} from 'reka-ui';
import NavIcon from '../NavIcon.vue';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../stores/auth.store';
import { useTheme, THEME_OPTIONS, type ThemePreference } from '../../composables/useTheme';

const { t } = useI18n();

defineProps<{ collapsed?: boolean }>();

const auth = useAuthStore();
const router = useRouter();
const { preference, setPreference } = useTheme();

const email = computed(() => auth.user?.email ?? t('shell.account.unknownEmail'));
const initials = computed(() => {
  const e = auth.user?.email ?? '?';
  return e.slice(0, 2).toUpperCase();
});

const itemClass =
  'flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-text-secondary outline-none ' +
  'data-[highlighted]:bg-surface-raise data-[highlighted]:text-text-primary';

const themeOptions = THEME_OPTIONS;

function go(to: string) {
  router.push(to);
}

async function handleLogout() {
  await auth.logout();
  await router.push('/login');
}
</script>
