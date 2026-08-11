<template>
  <span v-if="info" class="inline-flex items-center gap-1.5" :title="tooltip">
    <span class="inline-flex px-2 py-0.5 rounded text-xs font-medium" :class="badgeClass">
      {{ label }}
    </span>
    <span v-if="info.lists.length" class="text-xs text-text-ghost truncate max-w-[12rem]">
      {{ listNames }}
    </span>
  </span>
  <span v-else class="text-xs text-text-ghost">—</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

interface ListmonkSubscriberInfo {
  subscriberId: number;
  status: string;
  lists: { id: number; name: string; subscriptionStatus: string }[];
}

const props = defineProps<{
  info?: ListmonkSubscriberInfo | null;
}>();

const listNames = computed(() =>
  props.info?.lists.map((l) => l.name).join(', ') ?? '',
);

const tooltip = computed(() => {
  if (!props.info) return '';
  const lists = props.info.lists
    .map((l) => `${l.name} (${l.subscriptionStatus})`)
    .join(', ');
  // `status` is a raw Listmonk value and stays untranslated — only the
  // surrounding sentence is a message.
  return lists
    ? t('plugins.listmonk.tooltip.lists', { lists })
    : t('plugins.listmonk.tooltip.status', { status: props.info.status });
});

const label = computed(() => {
  if (!props.info) return '';
  // Map the stable token to a key; the raw value keeps driving the styling below.
  if (props.info.status === 'blocklisted') return t('plugins.listmonk.status.blocklisted');
  if (props.info.lists.length === 0) return t('plugins.listmonk.status.subscriber');
  return t('plugins.listmonk.status.subscribed');
});

const badgeClass = computed(() => {
  if (!props.info) return '';
  if (props.info.status === 'blocklisted') return 'bg-danger/15 text-danger';
  if (props.info.status === 'disabled') return 'bg-surface-raise2 text-text-muted';
  return 'bg-success/15 text-success';
});
</script>
