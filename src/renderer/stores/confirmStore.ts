import { create } from 'zustand';

export interface ConfirmAction {
  value: string;
  label: string;
  tone?: 'default' | 'primary' | 'danger';
}

export interface ChoiceRequest {
  title: string;
  message?: string;
  actions: ConfirmAction[];        // rendered left → right
  dismissValue?: string | null;    // value returned on Esc / backdrop; default null (abort)
}

interface ConfirmState {
  request: (ChoiceRequest & { id: number }) | null;
  resolver: ((value: string | null) => void) | null;
  open: (request: ChoiceRequest) => Promise<string | null>;
  settle: (value: string | null) => void;
}

let nextId = 1;

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  resolver: null,
  open: (request) =>
    new Promise<string | null>((resolve) => {
      // If a dialog is already open, resolve it as dismissed before showing the new one.
      get().resolver?.(get().request?.dismissValue ?? null);
      set({ request: { ...request, id: nextId++ }, resolver: resolve });
    }),
  settle: (value) => {
    const resolver = get().resolver;
    set({ request: null, resolver: null });
    resolver?.(value);
  },
}));

// General multi-choice dialog. Resolves the picked action's value, or the
// request's dismissValue (default null) when dismissed via Esc / backdrop.
export const choose = (request: ChoiceRequest) => useConfirmStore.getState().open(request);

// Boolean convenience — styled async replacement for window.confirm().
// Resolves true only when confirmed; both cancel and dismiss resolve false.
export async function confirm(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  const result = await choose({
    title: opts.title,
    message: opts.message,
    actions: [
      { value: 'cancel', label: opts.cancelLabel ?? 'Cancel', tone: 'default' },
      { value: 'confirm', label: opts.confirmLabel ?? 'Confirm', tone: opts.danger ? 'danger' : 'primary' },
    ],
    dismissValue: 'cancel',
  });
  return result === 'confirm';
}
