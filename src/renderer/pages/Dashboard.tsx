import { useEffect, useState, useCallback } from 'react';
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
  recentSessions: RecentSession[];
}

function formatDuration(min: number | null): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function CreateSessionModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [courtCount, setCourtCount] = useState(4);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
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
      <div className="bg-white rounded-2xl p-8 w-[400px] max-w-[90vw]" onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 24px 48px -12px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.04)', animation: 'ctxFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        <h3 className="text-lg font-bold text-zinc-900 tracking-tight mb-1">New Session</h3>
        <p className="text-sm text-zinc-500 mb-6">Create a new badminton session for today</p>

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
        )}

        <div className="mb-6">
          <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Courts</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <button
                key={n}
                onClick={() => setCourtCount(n)}
                className={`flex-1 h-10 text-sm font-semibold rounded-xl transition-all active:scale-95 ${
                  courtCount === n
                    ? 'bg-zinc-900 text-white shadow-[0_2px_8px_-2px_rgba(0,0,0,0.2)]'
                    : 'bg-white border border-zinc-200 text-zinc-500 hover:border-zinc-300'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

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

  const s = stats!;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-10" style={{ animation: 'fadeIn 0.3s ease' }}>

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 tracking-tight">Dashboard</h2>
            <p className="text-sm text-zinc-400 mt-0.5 font-medium">{s.playerCount} players registered</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="h-9 px-4 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 active:scale-[0.97] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)] transition-all inline-flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Session
          </button>
        </div>

        {/* Active Session Hero */}
        {s.activeSession ? (
          <div className="relative overflow-hidden rounded-2xl bg-zinc-900 mb-8 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)]">
            <div className="relative p-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                  <div>
                    <p className="text-lg font-semibold text-white tracking-tight">Session active</p>
                    <p className="text-sm text-zinc-400 mt-1 tabular-nums font-mono font-medium">
                      {s.activeSession.date} · {s.activeSession.courtCount} courts
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/checkin/${s.activeSession.id}`}
                    className="h-9 px-4 text-sm font-medium bg-white/10 text-white rounded-lg hover:bg-white/15 active:scale-[0.97] transition-all inline-flex items-center"
                  >
                    Check-in
                  </Link>
                  <Link
                    to={`/match/${s.activeSession.id}`}
                    className="h-9 px-4 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 active:scale-[0.97] shadow-[0_2px_8px_-2px_rgba(5,150,105,0.3)] transition-all inline-flex items-center"
                  >
                    Enter match
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full rounded-2xl border-2 border-dashed border-zinc-300 bg-white p-8 mb-8 hover:border-zinc-400 hover:bg-zinc-50 transition-all duration-200 text-left"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[15px] font-semibold text-zinc-700 tracking-tight">No active session</p>
                <p className="text-sm text-zinc-400 mt-1">Create a new session to get started</p>
              </div>
              <span className="h-9 px-5 text-sm font-medium bg-zinc-800 text-white rounded-lg inline-flex items-center shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)]">
                Create session
              </span>
            </div>
          </button>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white border border-zinc-200/60 rounded-2xl p-5">
            <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider mb-2">Sessions</p>
            <p className="text-2xl font-bold text-zinc-900 tabular-nums tracking-tight font-mono">{s.sessionCount}</p>
            {s.avgDurationMin != null && (
              <p className="text-xs text-zinc-400 mt-1">avg {formatDuration(s.avgDurationMin)}</p>
            )}
          </div>

          <div className="bg-white border border-zinc-200/60 rounded-2xl p-5">
            <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider mb-2">Players</p>
            <p className="text-2xl font-bold text-zinc-900 tabular-nums tracking-tight font-mono">{s.playerCount}</p>
          </div>

          <div className="bg-white border border-zinc-200/60 rounded-2xl p-5">
            <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider mb-2">Games Played</p>
            <p className="text-2xl font-bold text-zinc-900 tabular-nums tracking-tight font-mono">{s.gamesPlayed}</p>
          </div>
        </div>

        {/* Recent sessions */}
        {s.recentSessions.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-zinc-700 tracking-tight">Recent Sessions</h3>
              <Link to="/history" className="text-xs font-medium text-zinc-400 hover:text-zinc-600 transition-colors">View all &rarr;</Link>
            </div>
            <div className="bg-white border border-zinc-200/60 rounded-2xl overflow-hidden">
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
