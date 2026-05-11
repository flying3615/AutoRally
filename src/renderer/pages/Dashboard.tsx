import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface SessionInfo {
  id: string;
  date: string;
  status: string;
  courtCount: number;
}

interface UnpaidPayment {
  id: string;
  playerName: string;
  amount: number;
}

export function Dashboard() {
  const [activeSession, setActiveSession] = useState<SessionInfo | null>(null);
  const [unpaidCount, setUnpaidCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      window.api.sessionsGetActive(),
      window.api.paymentsListUnpaid(),
    ]).then(([s, p]) => {
      setActiveSession((s as SessionInfo | undefined) ?? null);
      setUnpaidCount((p as UnpaidPayment[]).length);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-40 h-4 skeleton" />
          <div className="w-28 h-3 skeleton" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-10" style={{ animation: 'fadeIn 0.3s ease' }}>

        {/* Active Session Hero */}
        {activeSession ? (
          <div className="relative overflow-hidden rounded-2xl bg-zinc-900 mb-8 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)]">
            <div className="dot-pattern" />
            <div className="relative p-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.4)]" />
                  <div>
                    <p className="text-lg font-semibold text-white tracking-tight">Session active</p>
                    <p className="text-sm text-zinc-400 mt-1 tabular-nums font-mono font-medium">
                      {activeSession.date} · {activeSession.courtCount} courts
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/checkin/${activeSession.id}`}
                    className="h-9 px-4 text-sm font-medium bg-white/10 text-white rounded-lg hover:bg-white/15 active:scale-[0.97] transition-all inline-flex items-center justify-center"
                  >
                    Check-in
                  </Link>
                  <Link
                    to={`/match/${activeSession.id}`}
                    className="h-9 px-4 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 active:scale-[0.97] shadow-[0_2px_8px_-2px_rgba(5,150,105,0.3)] transition-all inline-flex items-center justify-center"
                  >
                    Enter match
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[15px] font-semibold text-zinc-700 tracking-tight">No active session</p>
                <p className="text-sm text-zinc-400 mt-1">Create a new session to get started</p>
              </div>
              <Link
                to="/sessions"
                className="h-9 px-5 text-sm font-medium bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 active:scale-[0.97] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)] transition-all inline-flex items-center justify-center"
              >
                Create session
              </Link>
            </div>
          </div>
        )}

        {/* Status row */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Link
            to="/payments"
            className="group bg-white border border-zinc-200/60 rounded-2xl p-5 hover:border-zinc-300 hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.05)] transition-all duration-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider mb-2.5">Unpaid</p>
                <p className="text-2xl font-bold text-zinc-900 tabular-nums tracking-tight font-mono">{unpaidCount}</p>
              </div>
              <span className="text-xs text-zinc-300 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all">→</span>
            </div>
          </Link>

          <Link
            to="/history"
            className="group bg-white border border-zinc-200/60 rounded-2xl p-5 hover:border-zinc-300 hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.05)] transition-all duration-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider mb-2.5">History</p>
                <p className="text-sm text-zinc-500 font-medium">View past sessions</p>
              </div>
              <span className="text-xs text-zinc-300 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all">→</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
