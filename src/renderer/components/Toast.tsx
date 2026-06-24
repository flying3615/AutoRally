import { useToastStore } from '../stores/toastStore';
import type { ToastTone } from '../stores/toastStore';

const TONE: Record<ToastTone, { accent: string; bg: string; icon: React.ReactNode }> = {
  error: {
    accent: '#dc2626',
    bg: '#fef2f2',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
  },
  success: {
    accent: '#059669',
    bg: '#ecfdf5',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
  },
  info: {
    accent: '#52525b',
    bg: '#f4f4f5',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
    ),
  },
};

export function ToastViewport() {
  const toasts = useToastStore(s => s.toasts);
  const dismiss = useToastStore(s => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-14 right-4 z-[300] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)] pointer-events-none">
      {toasts.map(t => {
        const tone = TONE[t.tone];
        return (
          <div
            key={t.id}
            role="alert"
            onClick={() => dismiss(t.id)}
            className="pointer-events-auto flex items-start gap-3 bg-white rounded-xl p-3.5 pr-4 cursor-pointer select-none border border-zinc-200/70"
            style={{
              borderLeft: `3px solid ${tone.accent}`,
              boxShadow: '0 12px 28px -10px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.02)',
              animation: 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <svg
              className="w-5 h-5 shrink-0 mt-px"
              style={{ color: tone.accent }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}
            >
              {tone.icon}
            </svg>
            <p className="flex-1 text-sm text-zinc-700 leading-snug whitespace-pre-line break-words">{t.message}</p>
            <button
              aria-label="Dismiss"
              onClick={(e) => { e.stopPropagation(); dismiss(t.id); }}
              className="shrink-0 text-zinc-300 hover:text-zinc-500 transition-colors -mr-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
