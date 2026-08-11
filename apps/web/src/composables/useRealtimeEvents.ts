import { onMounted, onUnmounted } from 'vue';
import { usePipelineStore } from '../stores/pipeline.store';
import { useFormsStore } from '../stores/forms.store';
import { useBoardsStore } from '../stores/boards.store';
import { useMailStore } from '../stores/mail.store';

export function useRealtimeEvents() {
  let source: EventSource | null = null;

  const pipelineStore = usePipelineStore();
  const formsStore = useFormsStore();
  const boardsStore = useBoardsStore();
  const mailStore = useMailStore();

  onMounted(() => {
    source = new EventSource('/api/events/stream', { withCredentials: true });

    source.onmessage = (e: MessageEvent) => {
      try {
        const { type, data } = JSON.parse(e.data);
        switch (type) {
          case 'lead.created':
          case 'lead.moved':
          case 'lead.deleted':
            pipelineStore.fetchBoard();
            break;
          case 'submission.created':
            formsStore.onNewSubmission(data);
            break;
          case 'email.sent':
          case 'email.received':
          case 'email.deleted':
            void mailStore.onMailEvent(data ?? {});
            // Board cards show hasNewMail from last inbound — refresh when mail moves.
            void pipelineStore.fetchBoard();
            break;
          case 'boards.task.moved':
          case 'boards.task.created':
          case 'boards.task.deleted':
            if (boardsStore.dragging) break;
            if (boardsStore.currentModule?.id && data?.moduleId === boardsStore.currentModule.id) {
              boardsStore.fetchBoard(boardsStore.currentModule.id);
            }
            break;
        }
      } catch {
        // ignore malformed events
      }
    };
  });

  onUnmounted(() => {
    source?.close();
    source = null;
  });
}
