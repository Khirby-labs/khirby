import { getSessionGeneration } from '../api/client';
import { defineStore } from './session-state';
import { ref } from 'vue';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/client';
import { useToastStore } from './toast.store';
import { i18n } from '../i18n';

/** Stores live outside a component, so they translate off the global instance. */
const t = (key: string) => i18n.global.t(key as never);
import type {
  LeadBoard,
  LeadDetail,
  LeadBoardItem,
  LeadComment,
  PipelineStage,
  LeadAssignee,
  LeadPriority,
} from '@khirby/types';

function cloneBoard(board: LeadBoard | null): LeadBoard | null {
  return board ? (JSON.parse(JSON.stringify(board)) as LeadBoard) : null;
}

/**
 * The api client throws an Error whose message is the server's `message`/`error`.
 * Surface that to the user instead of a generic string, so a failure explains
 * itself (e.g. "Email already a lead") — falling back only when there is none.
 */
function failMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export const usePipelineStore = defineStore('pipeline', () => {
  const board = ref<LeadBoard | null>(null);
  const stages = ref<PipelineStage[]>([]);
  const assignees = ref<LeadAssignee[]>([]);
  const selectedLead = ref<LeadDetail | null>(null);
  const loading = ref(false);
  const error = ref('');

  async function fetchBoard(ownerId?: string) {
    loading.value = true;
    error.value = '';
    try {
      const params = ownerId ? `?ownerId=${encodeURIComponent(ownerId)}` : '';
      board.value = await apiGet<LeadBoard>(`/api/leads/board${params}`);
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : t('pipeline.errors.loadBoard');
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchStages() {
    stages.value = await apiGet<PipelineStage[]>('/api/pipeline/stages');
    return stages.value;
  }

  async function fetchAssignees() {
    assignees.value = await apiGet<LeadAssignee[]>('/api/leads/assignees');
    return assignees.value;
  }

  async function fetchLead(id: string) {
    selectedLead.value = await apiGet<LeadDetail>(`/api/leads/${id}`);
    return selectedLead.value;
  }

  function applyMoveLocally(leadId: string, toStageId: string) {
    if (!board.value) return;
    let movedLead: LeadBoardItem | null = null;

    for (const col of board.value.columns) {
      const idx = col.leads.findIndex((l) => l.id === leadId);
      if (idx >= 0) {
        movedLead = col.leads.splice(idx, 1)[0];
        col.count = col.leads.length;
        col.totalValue = String(col.leads.reduce((s, l) => s + (Number(l.value) || 0), 0));
        break;
      }
    }

    if (!movedLead) return;

    movedLead.stageId = toStageId;
    movedLead.updatedAt = new Date().toISOString();

    const target = board.value.columns.find((c) => c.stage.id === toStageId);
    if (target) {
      target.leads.unshift(movedLead);
      target.count = target.leads.length;
      target.totalValue = String(target.leads.reduce((s, l) => s + (Number(l.value) || 0), 0));
    }
  }

  async function moveLead(leadId: string, toStageId: string) {
    const toast = useToastStore();
    const generation = getSessionGeneration();
    const snapshot = cloneBoard(board.value);
    applyMoveLocally(leadId, toStageId);

    if (selectedLead.value?.id === leadId) {
      selectedLead.value.stageId = toStageId;
    }

    try {
      await apiPatch(`/api/leads/${leadId}`, { stageId: toStageId });
      toast.success(t('pipeline.toast.leadMoved'));
    } catch (e: unknown) {
      if (generation !== getSessionGeneration()) throw e;
      board.value = snapshot;
      const message = failMessage(e, t('pipeline.errors.moveLead'));
      toast.error(message);
      throw new Error(message);
    }
  }

  async function updateLead(
    id: string,
    patch: {
      title?: string;
      value?: string | null;
      priority?: LeadPriority;
      stageId?: string;
      ownerId?: string | null;
    },
  ) {
    const toast = useToastStore();
    const generation = getSessionGeneration();
    const snapshot = selectedLead.value
      ? (JSON.parse(JSON.stringify(selectedLead.value)) as LeadDetail)
      : null;

    if (selectedLead.value?.id === id) {
      Object.assign(selectedLead.value, patch);
    }

    if (patch.stageId && board.value) {
      applyMoveLocally(id, patch.stageId);
    } else if (board.value) {
      for (const col of board.value.columns) {
        const lead = col.leads.find((l) => l.id === id);
        if (lead) Object.assign(lead, patch);
      }
    }

    try {
      const updated = await apiPatch<LeadDetail>(`/api/leads/${id}`, patch);
      if (selectedLead.value?.id === id) {
        selectedLead.value = { ...selectedLead.value, ...updated };
      }
      toast.success(t('pipeline.toast.saved'));
      return updated;
    } catch (e: unknown) {
      if (generation !== getSessionGeneration()) throw e;
      if (snapshot && selectedLead.value?.id === id) {
        selectedLead.value = snapshot;
      }
      if (snapshot?.stageId && board.value) {
        await fetchBoard();
      }
      const message = failMessage(e, t('pipeline.errors.save'));
      toast.error(message);
      throw new Error(message);
    }
  }

  async function addComment(leadId: string, body: string) {
    const toast = useToastStore();
    try {
      const comment = await apiPost<LeadComment>(`/api/leads/${leadId}/comments`, { body });
      if (selectedLead.value?.id === leadId) {
        selectedLead.value.comments.push(comment);
      }
      toast.success(t('pipeline.toast.commentAdded'));
      return comment;
    } catch (e: unknown) {
      const message = failMessage(e, t('pipeline.errors.addComment'));
      toast.error(message);
      throw new Error(message);
    }
  }

  async function createLead(payload: {
    email: string;
    name?: string;
    title?: string;
    value?: string;
    priority?: LeadPriority;
    stageId?: string;
    ownerId?: string;
  }) {
    const toast = useToastStore();
    try {
      await apiPost('/api/leads', payload);
      toast.success(t('pipeline.toast.leadCreated'));
    } catch (e: unknown) {
      const message = failMessage(e, t('pipeline.errors.createLead'));
      toast.error(message);
      throw new Error(message);
    }
  }

  async function deleteLead(id: string) {
    const toast = useToastStore();
    try {
      await apiDelete(`/api/leads/${id}`);

      if (board.value) {
        for (const col of board.value.columns) {
          const idx = col.leads.findIndex((l) => l.id === id);
          if (idx >= 0) {
            col.leads.splice(idx, 1);
            col.count = col.leads.length;
            col.totalValue = String(col.leads.reduce((s, l) => s + (Number(l.value) || 0), 0));
            break;
          }
        }
      }

      if (selectedLead.value?.id === id) {
        selectedLead.value = null;
      }

      toast.success(t('pipeline.toast.leadDeleted'));
    } catch (e: unknown) {
      const message = failMessage(e, t('pipeline.errors.deleteLead'));
      toast.error(message);
      throw new Error(message);
    }
  }

  async function createStage(payload: {
    name: string;
    color: string;
    isWon?: boolean;
    isLost?: boolean;
  }) {
    const toast = useToastStore();
    try {
      await apiPost('/api/pipeline/stages', payload);
      toast.success(t('pipeline.toast.stageCreated'));
      await fetchStages();
    } catch (e: unknown) {
      const message = failMessage(e, t('pipeline.errors.createStage'));
      toast.error(message);
      throw new Error(message);
    }
  }

  async function updateStage(
    id: string,
    payload: Partial<{
      name: string;
      color: string;
      isWon: boolean;
      isLost: boolean;
    }>,
  ) {
    const toast = useToastStore();
    try {
      await apiPatch(`/api/pipeline/stages/${id}`, payload);
      toast.success(t('pipeline.toast.stageUpdated'));
      await fetchStages();
    } catch (e: unknown) {
      const message = failMessage(e, t('pipeline.errors.updateStage'));
      toast.error(message);
      throw new Error(message);
    }
  }

  async function deleteStage(id: string) {
    const toast = useToastStore();
    try {
      await apiDelete(`/api/pipeline/stages/${id}`);
      toast.success(t('pipeline.toast.stageDeleted'));
      await fetchStages();
    } catch (e: unknown) {
      const message = failMessage(e, t('pipeline.errors.deleteStage'));
      toast.error(message);
      throw new Error(message);
    }
  }

  async function reorderStages(stageIds: string[]) {
    const toast = useToastStore();
    try {
      stages.value = await apiPatch<PipelineStage[]>('/api/pipeline/stages/reorder', { stageIds });
      toast.success(t('pipeline.toast.stagesReordered'));
    } catch (e: unknown) {
      const message = failMessage(e, t('pipeline.errors.reorderStages'));
      toast.error(message);
      throw new Error(message);
    }
  }

  return {
    board,
    stages,
    assignees,
    selectedLead,
    loading,
    error,
    fetchBoard,
    fetchStages,
    fetchAssignees,
    fetchLead,
    moveLead,
    updateLead,
    addComment,
    createLead,
    deleteLead,
    createStage,
    updateStage,
    deleteStage,
    reorderStages,
  };
});
