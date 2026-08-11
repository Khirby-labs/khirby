<template>
  <div class="flex flex-col items-center justify-center h-full gap-4 text-text-muted">
    <div class="text-6xl">404</div>
    <div class="text-xl font-medium text-text-secondary">{{ t('errors.notFound.title') }}</div>
    <RouterLink to="/" class="text-accent hover:text-accent text-sm">
      <span aria-hidden="true">←</span> {{ t('errors.notFound.back') }}
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
/**
 * Rendered outside the app layout, before a session exists — so it may not read
 * `auth.user` for anything, locale included. `404` is a number, not copy, and
 * the ← glyph lives in markup (`.claude/rules/i18n.md`).
 */
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';

const { t } = useI18n();
</script>
