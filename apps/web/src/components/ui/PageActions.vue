<template>
  <Teleport to="#topbar-actions" defer>
    <slot />
  </Teleport>
</template>

<script setup lang="ts">
/**
 * Contextual top-bar actions. A view wraps its page-level controls in
 * <PageActions> and they render into the top bar's contextual slot, so the
 * shell frame stays global while each page fills the slot it owns.
 * `defer` lets the target (rendered by AppTopbar) resolve regardless of order.
 */
</script>
