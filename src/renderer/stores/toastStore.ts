import { create } from 'zustand';

export type ToastTone = 'error' | 'success' | 'info';

export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastState {
  toasts: ToastItem[];
  push: (tone: ToastTone, message: string, durationMs?: number) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (tone, message, durationMs = 4500) => {
    const id = nextId++;
    set(state => ({ toasts: [...state.toasts, { id, tone, message }] }));
    if (durationMs > 0) {
      setTimeout(() => get().dismiss(id), durationMs);
    }
  },
  dismiss: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),
}));

// Imperative helpers — callable from anywhere, including non-component hooks
// and utilities. Replaces window.alert() for transient notifications.
export const toast = {
  error: (message: string) => useToastStore.getState().push('error', message, 6000),
  success: (message: string) => useToastStore.getState().push('success', message, 3000),
  info: (message: string) => useToastStore.getState().push('info', message, 4500),
};
