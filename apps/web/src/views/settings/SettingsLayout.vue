<template>
  <div class="flex h-full flex-col">
    <h2 class="crm-page-title mb-6 flex-shrink-0">{{ t('settings.title') }}</h2>
    <div class="flex min-h-0 flex-1 flex-col gap-8 lg:flex-row lg:gap-12">
      <!-- Sub-nav — a left rail for the Settings area; stays a horizontal bar below lg,
           where the app sidebar (240px) would otherwise leave too little content width -->
      <nav
        class="flex flex-row gap-1 overflow-x-auto border-border-subtle lg:w-56 lg:flex-shrink-0 lg:flex-col lg:overflow-visible lg:border-r lg:pr-8"
        :aria-label="t('settings.navLabel')"
      >
        <RouterLink
          v-for="item in settingsNav"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-raise hover:text-text-primary"
          active-class="!text-text-primary bg-surface-raise2"
        >
          <NavIcon :name="item.icon" />
          {{ t(item.labelKey) }}
        </RouterLink>
      </nav>

      <!-- Section content — each view manages its own max width (General is a narrow form) -->
      <div class="min-w-0 min-h-0 flex-1">
        <RouterView />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Settings console — a single sidebar entry point that expands into an admin
 * area with its own sub-nav. Members / Roles / Plugins moved here out of the
 * main sidebar (docs/DESIGN-SYSTEM.md §6: operational surfaces stay in the
 * main list; governance sinks into Settings).
 */
import { RouterLink, RouterView } from 'vue-router';
import { useI18n } from 'vue-i18n';
import NavIcon from '../../components/NavIcon.vue';
import { settingsNav } from '../../lib/nav';

const { t } = useI18n();
</script>
