<template>
  <div class="md-editor">
    <div v-if="editing" class="space-y-2">
      <div
        class="flex flex-wrap items-center gap-0.5 rounded-md border border-border bg-surface-raise px-1 py-1"
        role="toolbar"
        :aria-label="t('boards.markdown.toolbar')"
      >
        <button
          v-for="btn in toolbar"
          :key="btn.label"
          type="button"
          class="rounded px-2 py-1 text-xs font-medium text-text-muted hover:bg-surface-raise2 hover:text-text-primary"
          :title="btn.title"
          @mousedown.prevent="applyWrap(btn)"
        >
          {{ btn.label }}
        </button>
        <span class="flex-1" />
        <button
          type="button"
          class="rounded px-2 py-1 text-xs text-text-ghost hover:text-text-muted"
          @click="cancel"
        >
          {{ t('common.actions.cancel') }}
        </button>
        <button
          type="button"
          class="rounded px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10"
          @click="commit"
        >
          {{ t('common.actions.save') }}
        </button>
      </div>

      <textarea
        ref="ta"
        v-model="draft"
        class="min-h-[12rem] w-full resize-y rounded-md border border-border bg-surface-input px-3 py-2.5 font-mono text-sm leading-relaxed text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
        :placeholder="placeholder"
        @keydown="onKeydown"
      />
      <p class="text-[11px] text-text-ghost">
        {{ t('boards.markdown.hint') }}
      </p>
    </div>

    <button
      v-else
      type="button"
      class="-mx-1 min-h-[4.5rem] w-full rounded-md border border-transparent px-1 py-1 text-left transition-colors hover:border-border/60 hover:bg-surface-raise/40"
      @click="startEdit"
    >
      <div v-if="modelValue?.trim()" class="md-body text-sm text-text-primary" v-html="html" />
      <p v-else class="px-1 py-2 text-sm text-text-ghost">
        {{ placeholder }}
      </p>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { renderMarkdown } from '../../../utils/markdown';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    autoEdit?: boolean;
  }>(),
  {
    placeholder: '',
    autoEdit: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  save: [value: string];
}>();

const { t } = useI18n();
const editing = ref(false);
const draft = ref(props.modelValue);
const ta = ref<HTMLTextAreaElement | null>(null);
const savedSnapshot = ref(props.modelValue);

watch(
  () => props.modelValue,
  (v) => {
    if (!editing.value) {
      draft.value = v;
      savedSnapshot.value = v;
    }
  },
);

const html = computed(() => renderMarkdown(props.modelValue || ''));

type ToolbarBtn = {
  label: string;
  title: string;
  before: string;
  after: string;
  placeholder?: string;
  block?: boolean;
};

const toolbar = computed<ToolbarBtn[]>(() => [
  {
    label: 'B',
    title: t('boards.markdown.bold'),
    before: '**',
    after: '**',
    placeholder: t('boards.markdown.phBold'),
  },
  {
    label: 'I',
    title: t('boards.markdown.italic'),
    before: '_',
    after: '_',
    placeholder: t('boards.markdown.phItalic'),
  },
  {
    label: '`',
    title: t('boards.markdown.code'),
    before: '`',
    after: '`',
    placeholder: t('boards.markdown.phCode'),
  },
  {
    label: '<>',
    title: t('boards.markdown.codeBlock'),
    before: '```\n',
    after: '\n```',
    placeholder: t('boards.markdown.phCode'),
    block: true,
  },
  {
    label: 'H',
    title: t('boards.markdown.heading'),
    before: '## ',
    after: '',
    placeholder: t('boards.markdown.phHeading'),
    block: true,
  },
  {
    label: '•',
    title: t('boards.markdown.list'),
    before: '- ',
    after: '',
    placeholder: t('boards.markdown.phItem'),
    block: true,
  },
  {
    label: '1.',
    title: t('boards.markdown.ordered'),
    before: '1. ',
    after: '',
    placeholder: t('boards.markdown.phItem'),
    block: true,
  },
  {
    label: '[ ]',
    title: t('boards.markdown.checklist'),
    before: '- [ ] ',
    after: '',
    placeholder: t('boards.markdown.phTask'),
    block: true,
  },
  {
    label: '[]',
    title: t('boards.markdown.link'),
    before: '[',
    after: '](url)',
    placeholder: t('boards.markdown.phLink'),
  },
]);

async function startEdit() {
  draft.value = props.modelValue;
  savedSnapshot.value = props.modelValue;
  editing.value = true;
  await nextTick();
  ta.value?.focus();
}

function cancel() {
  draft.value = savedSnapshot.value;
  editing.value = false;
}

function commit() {
  const next = draft.value;
  emit('update:modelValue', next);
  emit('save', next);
  savedSnapshot.value = next;
  editing.value = false;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    cancel();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    commit();
  }
}

/** Wrap selection; mousedown.prevent keeps textarea focus/selection. */
function applyWrap(btn: ToolbarBtn) {
  const el = ta.value;
  if (!el) return;
  const value = el.value;
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  const selected = value.slice(start, end) || btn.placeholder || '';
  const needsLeadingNewline = !!btn.block && start > 0 && value[start - 1] !== '\n';
  const insert = `${needsLeadingNewline ? '\n' : ''}${btn.before}${selected}${btn.after}`;
  const next = value.slice(0, start) + insert + value.slice(end);
  draft.value = next;
  el.value = next;
  const prefix = (needsLeadingNewline ? 1 : 0) + btn.before.length;
  const cursor = start + prefix;
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(cursor, cursor + selected.length);
  });
}

if (props.autoEdit) {
  void startEdit();
}
</script>

<style scoped>
.md-body :deep(p) {
  margin: 0.4em 0;
}
.md-body :deep(p:first-child) {
  margin-top: 0;
}
.md-body :deep(p:last-child) {
  margin-bottom: 0;
}
.md-body :deep(h1),
.md-body :deep(h2),
.md-body :deep(h3) {
  font-weight: 600;
  color: var(--text-primary);
  margin: 0.85em 0 0.35em;
  line-height: 1.3;
}
.md-body :deep(h1) {
  font-size: 1.25rem;
}
.md-body :deep(h2) {
  font-size: 1.1rem;
}
.md-body :deep(h3) {
  font-size: 1rem;
}
.md-body :deep(ul),
.md-body :deep(ol) {
  margin: 0.4em 0;
  padding-left: 1.35rem;
}
.md-body :deep(li) {
  margin: 0.15em 0;
}
.md-body :deep(code) {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.85em;
  background: var(--surface-raise);
  border: 1px solid var(--border-default);
  border-radius: 0.25rem;
  padding: 0.1em 0.35em;
}
.md-body :deep(pre) {
  margin: 0.6em 0;
  padding: 0.75rem 1rem;
  background: var(--surface-input);
  border: 1px solid var(--border-default);
  border-radius: 0.5rem;
  overflow-x: auto;
}
.md-body :deep(pre code) {
  background: transparent;
  border: none;
  padding: 0;
  font-size: 0.8rem;
}
.md-body :deep(a) {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.md-body :deep(blockquote) {
  margin: 0.5em 0;
  padding-left: 0.85rem;
  border-left: 3px solid var(--border-strong);
  color: var(--text-muted);
}
.md-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-default);
  margin: 1em 0;
}
.md-body :deep(input[type='checkbox']) {
  margin-right: 0.4rem;
}
.md-body :deep(strong) {
  font-weight: 600;
  color: var(--text-primary);
}
.md-body :deep(em) {
  font-style: italic;
}
</style>
