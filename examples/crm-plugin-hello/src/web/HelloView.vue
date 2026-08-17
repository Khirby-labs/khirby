<script setup lang="ts">
/**
 * The fixture's page. It resolves the SAME two keys the plugin declares as
 * `displayNameKey` / `descriptionKey`, so the page and the Marketplace card read
 * identically in both languages (ADR-0011).
 *
 * It deliberately does NOT pass a local `messages` catalog to `useI18n()`: the app
 * augments vue-i18n's types with its own locale schema, so an inline catalog fails
 * the typecheck the moment this package joins the workspace — and it would be a
 * second home for strings that already live in `apps/web/src/i18n/messages`.
 */
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <div class="space-y-2 p-6">
    <h1 class="text-xl font-semibold text-text-primary">{{ t('plugins.hello.displayName') }}</h1>
    <p class="text-sm text-text-muted">{{ t('plugins.hello.description') }}</p>
  </div>
</template>
