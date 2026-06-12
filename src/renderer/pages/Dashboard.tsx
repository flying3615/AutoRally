import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';

interface ActiveSession {
  id: string;
  date: string;
  startTime: string;
  courtCount: number;
}

interface RecentSession {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  courtCount: number;
  durationMin: number | null;
}

interface DashboardStats {
  playerCount: number;
  sessionCount: number;
  gamesPlayed: number;
  avgDurationMin: number | null;
  activeSession: ActiveSession | null;
  sessionStats: {
    checkinCount: number;
    maleCount: number;
    femaleCount: number;
    creditCount: number;
    cashCount: number;
  } | null;
  recentSessions: RecentSession[];
}

function formatDuration(min: number | null): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function useElapsedDuration(startTime: string | null | undefined): string {
  const [elapsed, setElapsed] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!startTime) { setElapsed(''); return; }

    const tick = () => {
      const start = new Date(startTime).getTime();
      const diff = Math.max(0, Date.now() - start);
      const totalMin = Math.floor(diff / 60000);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      setElapsed(h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`);
    };

    tick();
    timerRef.current = setInterval(tick, 30000);
    return () => clearInterval(timerRef.current);
  }, [startTime]);

  return elapsed;
}

function CreateSessionModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const settings = await window.api.settingsGetAll() as Record<string, string>;
      const courtCount = Number(settings.courtCount ?? '4');
      const id = await window.api.sessionsCreate(courtCount) as string;
      onCreated(id);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-8 w-[360px] max-w-[90vw]" onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 24px 48px -12px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.04)', animation: 'ctxFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        <h3 className="text-lg font-bold text-zinc-900 tracking-tight mb-1">New Session</h3>
        <p className="text-sm text-zinc-500 mb-6">Create a new badminton session for today</p>

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex-1 h-10 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 active:scale-[0.97] transition-all disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Session'}
          </button>
          <button
            onClick={onClose}
            className="h-10 px-5 text-sm font-medium text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const s = await window.api.dashboardStats() as DashboardStats;
    setStats(s);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = () => setShowCreate(true);
    window.addEventListener('shortcut:new-session', handler);
    return () => window.removeEventListener('shortcut:new-session', handler);
  }, []);

  const s = stats;
  const elapsed = useElapsedDuration(s?.activeSession?.startTime);

  if (loading || !s) {
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
    <div className="ar-page">
      <div className="ar-page-inner">

        {/* Header */}
        <div className="ar-page-header">
          <div>
            <h1 className="ar-page-title">Dashboard</h1>
            <p className="ar-page-copy">Live club operations, recent sessions, and payment health.</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            disabled={!!s.activeSession}
            className="ar-primary-button"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Session
          </button>
        </div>

        {/* Active Session Hero */}
        {s.activeSession ? (
          <div className="ar-hero-card mb-8">
            <div className="dot-pattern" />
            <div className="relative p-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                  <div>
                    <p className="text-lg font-semibold text-white tracking-tight">Session active</p>
                    <p className="text-sm text-zinc-400 mt-1 tabular-nums font-mono font-medium">
                      {s.activeSession.startTime
                        ? `Started at ${new Date(s.activeSession.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} · ${elapsed} · ${s.activeSession.courtCount} courts`
                        : `${s.activeSession.date} · ${s.activeSession.courtCount} courts`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      await window.api.sessionsEnd(s.activeSession!.id);
                      load();
                    }}
                    className="ar-danger-button"
                  >
                    End Session
                  </button>
                </div>
              </div>

              {/* Session check-in stats */}
              {s.sessionStats && (
                <div className="flex items-center gap-6 mt-5 pt-5 border-t border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-white tabular-nums font-mono">{s.sessionStats.checkinCount}</span>
                    <span className="text-xs text-zinc-400 font-medium leading-tight">checked<br/>in</span>
                  </div>
                  <div className="w-px h-8 bg-white/10" />
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span className="w-2 h-2 rounded-full bg-blue-400" />
                      <span className="text-white tabular-nums font-mono font-semibold">{s.sessionStats.maleCount}</span>
                      <span className="text-zinc-500">M</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span className="w-2 h-2 rounded-full bg-pink-400" />
                      <span className="text-white tabular-nums font-mono font-semibold">{s.sessionStats.femaleCount}</span>
                      <span className="text-zinc-500">F</span>
                    </span>
                  </div>
                  <div className="w-px h-8 bg-white/10" />
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span className="text-white tabular-nums font-mono font-semibold">{s.sessionStats.creditCount}</span>
                      <span className="text-zinc-500">credit</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span className="text-white tabular-nums font-mono font-semibold">{s.sessionStats.cashCount}</span>
                      <span className="text-zinc-500">cash</span>
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-zinc-300 bg-white p-8 mb-8 text-center">
            <p className="text-[15px] font-semibold text-zinc-700 tracking-tight">No active session</p>
            <p className="text-sm text-zinc-400 mt-1">Click <strong className="text-zinc-600">New Session</strong> above to get started</p>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="ar-stat-card">
            <p className="ar-stat-label">Sessions</p>
            <p className="ar-stat-value">{s.sessionCount}</p>
            {s.avgDurationMin != null && (
              <p className="ar-stat-meta">avg {formatDuration(s.avgDurationMin)}</p>
            )}
          </div>

          <div className="ar-stat-card">
            <p className="ar-stat-label">Players</p>
            <p className="ar-stat-value">{s.playerCount}</p>
          </div>

          <div className="ar-stat-card">
            <p className="ar-stat-label">Games played</p>
            <p className="ar-stat-value">{s.gamesPlayed}</p>
          </div>
        </div>

        {/* Recent sessions */}
        {s.recentSessions.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="ar-section-label">Recent sessions</h3>
              <Link to="/sessions" className="text-xs font-medium text-zinc-400 hover:text-zinc-600 transition-colors">View all &rarr;</Link>
            </div>
            <div className="ar-table-shell">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Date</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Courts</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {s.recentSessions.map(sess => (
                    <tr key={sess.id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50/50 transition-colors">
                      <td className="px-5 py-3 font-medium text-zinc-800 tabular-nums">{sess.date}</td>
                      <td className="px-5 py-3 text-zinc-500 tabular-nums">{sess.courtCount}</td>
                      <td className="px-5 py-3 text-zinc-500 font-mono tabular-nums">{formatDuration(sess.durationMin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {s.recentSessions.length === 0 && s.sessionCount === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
            <svg className="w-16 h-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <p className="text-sm font-medium mb-1">No sessions yet</p>
            <p className="text-xs opacity-60">Create your first session to get started</p>
          </div>
        )}

        {/* Create modal */}
        {showCreate && (
          <CreateSessionModal
            onClose={() => setShowCreate(false)}
            onCreated={(id) => {
              setShowCreate(false);
              navigate(`/checkin/${id}`);
            }}
          />
        )}
      </div>
    </div>
  );
}
