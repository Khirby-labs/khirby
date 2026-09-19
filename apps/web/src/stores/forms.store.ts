import { defineStore } from './session-state';
import { ref } from 'vue';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/client';
import { i18n } from '../i18n';

/** Stores live outside a component, so they translate off the global instance. */
const t = (key: string) => i18n.global.t(key as never);
import type {
  Form,
  FormListItem,
  FormStats,
  FormKind,
  FormDestination,
  FormIntakeMode,
  FormField,
  PaginatedResponse,
  SubmissionWithContact,
} from '@khirby/types';

export const useFormsStore = defineStore('forms', () => {
  const forms = ref<FormListItem[]>([]);
  const currentForm = ref<Form | null>(null);
  const stats = ref<FormStats | null>(null);
  const loading = ref(false);
  const error = ref('');

  async function fetchForms() {
    loading.value = true;
    error.value = '';
    try {
      forms.value = await apiGet<FormListItem[]>('/api/forms');
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : t('forms.errors.loadList');
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchForm(id: string) {
    loading.value = true;
    error.value = '';
    try {
      currentForm.value = await apiGet<Form>(`/api/forms/${id}`);
      return currentForm.value;
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : t('forms.errors.load');
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createForm(payload: {
    name: string;
    slug: string;
    schema: FormField[];
    kind: FormKind;
    active?: boolean;
    destination?: FormDestination;
    intakeMode?: FormIntakeMode;
    intakeBrief?: string | null;
    systemPrompt?: string | null;
    openingLabels?: { en?: string; pl?: string } | null;
  }) {
    return apiPost<Form>('/api/forms', payload);
  }

  async function updateForm(
    id: string,
    payload: Partial<{
      name: string;
      slug: string;
      schema: FormField[];
      kind: FormKind;
      active: boolean;
      destination: FormDestination;
      intakeMode: FormIntakeMode;
      intakeBrief: string | null;
      systemPrompt: string | null;
      openingLabels: { en?: string; pl?: string } | null;
    }>,
  ) {
    return apiPatch<Form>(`/api/forms/${id}`, payload);
  }

  async function draftSystemPrompt(id: string, brief: string, locale?: string) {
    return apiPost<{
      systemPrompt: string;
      openingLabels: { en: string; pl: string };
    }>(`/api/forms/${id}/draft-system-prompt`, {
      brief,
      ...(locale ? { locale } : {}),
    });
  }

  async function previewChat(
    id: string,
    payload: {
      messages: Array<{ role: 'visitor' | 'assistant'; content: string }>;
      content: string;
    },
  ) {
    return apiPost<{
      readyForReview: boolean;
      nextQuestion: string | null;
      summary: string | null;
    }>(`/api/forms/${id}/preview-chat`, payload);
  }

  async function planQuestions(id: string, openingMessage: string, locale?: string) {
    return apiPost<{ questions: string[] }>(`/api/forms/${id}/plan-questions`, {
      openingMessage,
      ...(locale ? { locale } : {}),
    });
  }

  async function deleteForm(id: string) {
    return apiDelete(`/api/forms/${id}`);
  }

  async function fetchSubmissions(
    formId: string,
    page = 1,
    pageSize = 20,
  ): Promise<PaginatedResponse<SubmissionWithContact>> {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    return apiGet<PaginatedResponse<SubmissionWithContact>>(
      `/api/forms/${formId}/submissions?${params}`,
    );
  }

  async function fetchStats(
    query: {
      from?: string;
      to?: string;
      formId?: string;
      daily?: boolean;
    } = {},
  ) {
    const params = new URLSearchParams();
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    if (query.formId) params.set('formId', query.formId);
    if (query.daily) params.set('daily', 'true');

    const qs = params.toString();
    stats.value = await apiGet<FormStats>(`/api/forms/stats${qs ? `?${qs}` : ''}`);
    return stats.value;
  }

  function onNewSubmission(data: { formId: string }) {
    const form = forms.value.find((f) => f.id === data.formId);
    if (form) form.submissionCount++;
  }

  return {
    forms,
    currentForm,
    stats,
    loading,
    error,
    fetchForms,
    fetchForm,
    createForm,
    updateForm,
    draftSystemPrompt,
    previewChat,
    planQuestions,
    deleteForm,
    fetchSubmissions,
    fetchStats,
    onNewSubmission,
  };
});
