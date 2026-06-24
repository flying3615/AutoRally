import { useEffect } from 'react';
import { useConfirmStore } from '../stores/confirmStore';
import type { ConfirmAction } from '../stores/confirmStore';

function actionClass(tone: ConfirmAction['tone']): string {
  if (tone === 'danger') return 'bg-red-600 hover:bg-red-700 text-white';
  if (tone === 'primary') return 'bg-emerald-600 hover:bg-emerald-700 text-white';
  return 'border border-zinc-200 text-zinc-600 hover:bg-zinc-50';
}

export function ConfirmDialog() {
  const request = useConfirmStore(s => s.request);
  const settle = useConfirmStore(s => s.settle);

  const actions = request?.actions ?? [];
  // The visually primary action (emphasised, focused, triggered by Enter).
  const primary = actions.find(a => a.tone === 'primary' || a.tone === 'danger') ?? actions[actions.length - 1];

  useEffect(() => {
    if (!request) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settle(request.dismissValue ?? null);
      else if (e.key === 'Enter' && primary) settle(primary.value);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [request, settle, primary]);

  if (!request) return null;

  const dismiss = () => settle(request.dismissValue ?? null);

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/30"
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
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
          {request.actions.map(action => (
            <button
              key={action.value}
              autoFocus={action === primary}
              onClick={() => settle(action.value)}
              className={`px-4 py-2 text-sm font-semibold rounded-xl active:scale-[0.97] transition-all ${actionClass(action.tone)}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
