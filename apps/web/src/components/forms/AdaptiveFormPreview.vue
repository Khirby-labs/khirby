<template>
  <div class="crm-panel p-5 space-y-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-sm font-semibold text-text-primary">
          {{ formName || t('forms.preview.untitledForm') }}
        </p>
        <p class="text-xs text-text-ghost mt-1">{{ t('forms.adaptive.preview.caption') }}</p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <div
          class="inline-flex rounded-md border border-border bg-surface-raised p-0.5"
          role="group"
          :aria-label="t('forms.preview.localeAria')"
        >
          <button
            type="button"
            class="px-2 py-0.5 text-xs font-medium rounded transition-colors"
            :class="
              previewLocale === 'en'
                ? 'bg-surface text-text-primary shadow-sm'
                : 'text-text-ghost hover:text-text-secondary'
            "
            :aria-pressed="previewLocale === 'en'"
            :disabled="phase !== 'idle'"
            @click="setPreviewLocale('en')"
          >
            {{ t('forms.preview.localeEn') }}
          </button>
          <button
            type="button"
            class="px-2 py-0.5 text-xs font-medium rounded transition-colors"
            :class="
              previewLocale === 'pl'
                ? 'bg-surface text-text-primary shadow-sm'
                : 'text-text-ghost hover:text-text-secondary'
            "
            :aria-pressed="previewLocale === 'pl'"
            :disabled="phase !== 'idle'"
            @click="setPreviewLocale('pl')"
          >
            {{ t('forms.preview.localePl') }}
          </button>
        </div>
        <button
          type="button"
          class="text-xs text-accent hover:text-accent"
          :disabled="phase === 'idle' || phase === 'planning'"
          @click="reset"
        >
          {{ t('forms.adaptive.preview.reset') }}
        </button>
      </div>
    </div>

    <!-- Phase indicator -->
    <div
      v-if="phase === 'questions' || phase === 'contact' || phase === 'done'"
      class="flex items-center gap-2 text-xs text-text-ghost"
      role="status"
    >
      <span
        class="rounded-md px-2 py-0.5"
        :class="
          phase === 'questions' ? 'bg-accent/15 text-accent' : 'bg-surface-raise text-text-ghost'
        "
      >
        {{ t('forms.adaptive.preview.phaseQuestions') }}
      </span>
      <span aria-hidden="true">→</span>
      <span
        class="rounded-md px-2 py-0.5"
        :class="
          phase === 'contact'
            ? 'bg-accent/15 text-accent'
            : phase === 'done'
              ? 'bg-accent/15 text-accent'
              : 'bg-surface-raise text-text-ghost'
        "
      >
        {{ t('forms.adaptive.preview.phaseContact') }}
      </span>
    </div>

    <Transition
      mode="out-in"
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <!-- Opening -->
      <form v-if="phase === 'idle'" key="idle" class="space-y-4" @submit.prevent="start">
        <div>
          <label for="adaptive-preview-opening" class="crm-label">
            {{ openingQuestion }}
            <span class="text-danger">
              <span aria-hidden="true">*</span>
              <span class="sr-only">{{ t('common.form.required') }}</span>
            </span>
          </label>
          <textarea
            id="adaptive-preview-opening"
            v-model="opening"
            class="crm-input"
            rows="3"
            :placeholder="visitorCopy('inputPlaceholder')"
            :disabled="!canTest"
          />
        </div>
        <p v-if="error" class="crm-error text-xs">{{ error }}</p>
        <button class="btn-primary w-full" type="submit" :disabled="!canTest || !opening.trim()">
          {{ t('forms.adaptive.preview.start') }}
        </button>
      </form>

      <!-- Inline planning card (replaces modal) -->
      <div
        v-else-if="phase === 'planning'"
        key="planning"
        class="rounded-lg border border-border bg-surface-raised/40 p-4 space-y-4"
        role="status"
        aria-live="polite"
        :aria-labelledby="loadingTitleId"
        :aria-describedby="loadingDescId"
      >
        <div class="flex items-start gap-3">
          <div
            class="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-border border-t-accent animate-spin"
            aria-hidden="true"
          />
          <div class="min-w-0">
            <p :id="loadingTitleId" class="text-sm font-medium text-text-primary">
              {{ t('forms.adaptive.preview.loadingTitle') }}
            </p>
            <p :id="loadingDescId" class="text-xs text-text-ghost mt-1">
              {{ t('forms.adaptive.preview.loadingBody') }}
            </p>
          </div>
        </div>
        <ul class="space-y-3" aria-hidden="true">
          <li v-for="i in 3" :key="i" class="space-y-2">
            <div
              class="h-3 rounded-md bg-surface-raise animate-pulse"
              :style="{ width: `${48 + i * 12}%` }"
            />
            <div class="h-16 rounded-md bg-surface-raise animate-pulse" />
          </li>
        </ul>
      </div>

      <!-- All follow-up questions at once -->
      <form
        v-else-if="phase === 'questions'"
        key="questions"
        class="space-y-4"
        @submit.prevent="goContact"
      >
        <div class="space-y-1 opacity-70">
          <label class="crm-label">{{ openingQuestion }}</label>
          <textarea class="crm-input" rows="2" :value="opening" readonly disabled />
        </div>
        <div v-for="(q, i) in questions" :key="i" class="space-y-1">
          <label :for="`adaptive-preview-q-${i}`" class="crm-label">
            {{ q }}
            <span class="text-danger">
              <span aria-hidden="true">*</span>
              <span class="sr-only">{{ t('common.form.required') }}</span>
            </span>
          </label>
          <textarea
            :id="`adaptive-preview-q-${i}`"
            v-model="answers[i]"
            class="crm-input"
            rows="2"
            :placeholder="visitorCopy('inputPlaceholder')"
          />
        </div>
        <p v-if="error" class="crm-error text-xs">{{ error }}</p>
        <button class="btn-primary w-full" type="submit" :disabled="!allQuestionsAnswered">
          {{ t('forms.adaptive.preview.continue') }}
        </button>
      </form>

      <!-- Contact confirmation -->
      <form
        v-else-if="phase === 'contact'"
        key="contact"
        class="space-y-4"
        @submit.prevent="finish"
      >
        <p class="text-sm text-text-secondary">{{ visitorCopy('contactIntro') }}</p>
        <div>
          <label for="adaptive-preview-name" class="crm-label">
            {{ visitorCopy('contactName') }}
            <span class="text-danger">
              <span aria-hidden="true">*</span>
              <span class="sr-only">{{ t('common.form.required') }}</span>
            </span>
          </label>
          <input
            id="adaptive-preview-name"
            v-model="contactName"
            type="text"
            class="crm-input"
            autocomplete="name"
            :placeholder="visitorCopy('contactNamePlaceholder')"
          />
        </div>
        <div>
          <label for="adaptive-preview-email" class="crm-label">
            {{ visitorCopy('contactEmail') }}
            <span class="text-danger">
              <span aria-hidden="true">*</span>
              <span class="sr-only">{{ t('common.form.required') }}</span>
            </span>
          </label>
          <input
            id="adaptive-preview-email"
            v-model="contactEmail"
            type="email"
            class="crm-input"
            autocomplete="email"
            :placeholder="visitorCopy('contactEmailPlaceholder')"
          />
        </div>
        <p v-if="error" class="crm-error text-xs">{{ error }}</p>
        <button class="btn-primary w-full" type="submit" :disabled="!contactReady">
          {{ t('forms.adaptive.preview.finish') }}
        </button>
      </form>

      <!-- Done -->
      <div v-else-if="phase === 'done'" key="done" class="space-y-4">
        <div
          class="text-xs text-success bg-success/10 border border-success/25 rounded-md px-2.5 py-1.5"
        >
          {{ t('forms.adaptive.preview.ready') }}
        </div>
        <div class="space-y-3">
          <div>
            <label class="crm-label">{{ openingQuestion }}</label>
            <textarea class="crm-input" rows="2" :value="opening" readonly disabled />
          </div>
          <div v-for="(q, i) in questions" :key="i">
            <label class="crm-label">{{ q }}</label>
            <textarea class="crm-input" rows="2" :value="answers[i] ?? ''" readonly disabled />
          </div>
          <div>
            <label class="crm-label">{{ visitorCopy('contactName') }}</label>
            <input class="crm-input" type="text" :value="contactName" readonly disabled />
          </div>
          <div>
            <label class="crm-label">{{ visitorCopy('contactEmail') }}</label>
            <input class="crm-input" type="email" :value="contactEmail" readonly disabled />
          </div>
        </div>
        <button type="button" class="btn-primary w-full" @click="reset">
          {{ t('forms.adaptive.preview.reset') }}
        </button>
      </div>
    </Transition>

    <p v-if="!canTest" class="text-xs text-warning">
      {{ t('forms.adaptive.errors.savePromptFirst') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFormsStore } from '../../stores/forms.store';

const props = defineProps<{
  formId: string;
  formName?: string;
  canTest: boolean;
  openingLabels?: { en?: string; pl?: string } | null;
}>();

const { t, locale } = useI18n();
const formsStore = useFormsStore();

const loadingTitleId = 'adaptive-preview-loading-title';
const loadingDescId = 'adaptive-preview-loading-desc';

type Phase = 'idle' | 'planning' | 'questions' | 'contact' | 'done';
type PreviewLocale = 'en' | 'pl';

/**
 * Visitor language for this preview run.
 * Defaults to the operator CRM UI locale so PL UI → PL questions on first try;
 * the EN/PL toggle still overrides per test (ADR-0025).
 */
const previewLocale = ref<PreviewLocale>(locale.value === 'pl' ? 'pl' : 'en');

const phase = ref<Phase>('idle');
const opening = ref('');
const questions = ref<string[]>([]);
const answers = ref<string[]>([]);
const contactName = ref('');
const contactEmail = ref('');
const error = ref('');

/** Real first question from the form — not a numbered placeholder. */
const openingQuestion = computed(() => {
  const labels = props.openingLabels;
  const fromLocale = labels?.[previewLocale.value]?.trim();
  if (fromLocale) return fromLocale;
  const fallback = labels?.en?.trim() || labels?.pl?.trim();
  if (fallback) return fallback;
  return t('forms.adaptive.preview.openingFallback', {}, { locale: previewLocale.value });
});

const allQuestionsAnswered = computed(
  () => questions.value.length > 0 && answers.value.every((a) => a.trim().length > 0),
);

const contactReady = computed(
  () => contactName.value.trim().length > 0 && isPlausibleEmail(contactEmail.value),
);

/** Visitor-facing copy follows the preview locale toggle, not the CRM UI language. */
function visitorCopy(key: string) {
  return t(`forms.adaptive.preview.${key}`, {}, { locale: previewLocale.value });
}

function isPlausibleEmail(value: string): boolean {
  const v = value.trim();
  return v.includes('@') && v.includes('.') && v.length >= 5;
}

watch(
  () => props.formId,
  () => reset(),
);

function setPreviewLocale(next: PreviewLocale) {
  if (previewLocale.value === next) return;
  previewLocale.value = next;
  if (phase.value !== 'idle') resetKeepLocale();
}

function resetKeepLocale() {
  phase.value = 'idle';
  opening.value = '';
  questions.value = [];
  answers.value = [];
  contactName.value = '';
  contactEmail.value = '';
  error.value = '';
}

function reset() {
  resetKeepLocale();
}

async function start() {
  const content = opening.value.trim();
  if (!content || !props.canTest || phase.value === 'planning') return;

  error.value = '';
  phase.value = 'planning';

  try {
    const result = await formsStore.planQuestions(props.formId, content, previewLocale.value);
    questions.value = result.questions;
    answers.value = result.questions.map(() => '');
    phase.value = 'questions';
  } catch (e: unknown) {
    phase.value = 'idle';
    error.value = e instanceof Error ? e.message : t('forms.adaptive.errors.preview');
  }
}

function goContact() {
  if (!allQuestionsAnswered.value) {
    error.value = t('forms.adaptive.preview.answersRequired');
    return;
  }
  error.value = '';
  phase.value = 'contact';
}

function finish() {
  if (!contactReady.value) {
    error.value = visitorCopy('contactInvalid');
    return;
  }
  error.value = '';
  phase.value = 'done';
}
</script>
