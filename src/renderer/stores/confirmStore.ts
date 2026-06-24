import { create } from 'zustand';

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;  // default 'Confirm'
  cancelLabel?: string;   // default 'Cancel'
  danger?: boolean;       // red confirm button for destructive actions
}

interface ConfirmState {
  request: (ConfirmRequest & { id: number }) | null;
  resolver: ((ok: boolean) => void) | null;
  open: (request: ConfirmRequest) => Promise<boolean>;
  settle: (ok: boolean) => void;
}

let nextId = 1;

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  resolver: null,
  open: (request) =>
    new Promise<boolean>((resolve) => {
      // If a dialog is already open, dismiss it as cancelled before showing the new one.
      get().resolver?.(false);
      set({ request: { ...request, id: nextId++ }, resolver: resolve });
    }),
  settle: (ok) => {
    const resolver = get().resolver;
    set({ request: null, resolver: null });
    resolver?.(ok);
  },
}));

// Imperative helper — styled async replacement for window.confirm().
// Resolves true when confirmed, false when cancelled or dismissed.
export const confirm = (request: ConfirmRequest) => useConfirmStore.getState().open(request);
