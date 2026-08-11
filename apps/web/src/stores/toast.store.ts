import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ToastVariant = 'success' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

let nextId = 0;

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<ToastItem[]>([]);

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  function show(message: string, variant: ToastVariant) {
    const id = ++nextId;
    toasts.value.push({ id, message, variant });
    setTimeout(() => dismiss(id), 3000);
  }

  function success(message: string) {
    show(message, 'success');
  }

  function error(message: string) {
    show(message, 'error');
  }

  return { toasts, success, error, dismiss };
});
