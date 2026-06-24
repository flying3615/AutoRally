import { useEffect } from 'react';
import { useConfirmStore } from '../stores/confirmStore';

export function ConfirmDialog() {
  const request = useConfirmStore(s => s.request);
  const settle = useConfirmStore(s => s.settle);

  useEffect(() => {
    if (!request) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settle(false);
      else if (e.key === 'Enter') settle(true);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [request, settle]);

  if (!request) return null;

  const confirmLabel = request.confirmLabel ?? 'Confirm';
  const cancelLabel = request.cancelLabel ?? 'Cancel';

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/30"
      onClick={(e) => { if (e.target === e.currentTarget) settle(false); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-2xl p-6 w-[400px] max-w-[90vw]"
        style={{
          boxShadow: '0 24px 48px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.04)',
          animation: 'ctxFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <h3 className="text-lg font-bold text-zinc-900 tracking-tight mb-2">{request.title}</h3>
        {request.message && (
          <p className="text-sm text-zinc-500 leading-relaxed mb-6 whitespace-pre-line">{request.message}</p>
        )}
        <div className={`flex items-center justify-end gap-2 ${request.message ? '' : 'mt-6'}`}>
          <button
            onClick={() => settle(false)}
            className="px-4 py-2 text-sm font-semibold text-zinc-600 rounded-xl border border-zinc-200 hover:bg-zinc-50 active:scale-[0.97] transition-all"
          >
            {cancelLabel}
          </button>
          <button
            autoFocus
            onClick={() => settle(true)}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-xl active:scale-[0.97] transition-all ${
              request.danger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
