import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { genderColors } from '../theme';

ModuleRegistry.registerModules([AllCommunityModule]);

interface SessionInfo {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  courtCount: number;
  status: string;
}

interface AttendanceInfo {
  id: string;
  playerId: string;
  sessionId: string;
  checkinTime: string;
  name: string;
  gender: string;
  level: number;
}

interface GameInfo {
  id: string;
  courtNumber: number;
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
  status: string;
  roundNumber: number;
  gameType: string;
  t1p1Name: string; t1p1Gender: string; t1p1Level: number;
  t1p2Name: string; t1p2Gender: string; t1p2Level: number;
  t2p1Name: string; t2p1Gender: string; t2p1Level: number;
  t2p2Name: string; t2p2Gender: string; t2p2Level: number;
}

interface PaymentInfo {
  id: string;
  playerId: string;
  playerName: string;
  amount: number;
  status: string;
  paymentType: string;
}

const formatTime = (t: string | null) => t ? new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-';

function gameTypeLabel(t: string): string {
  if (t === 'mixed') return 'Mixed';
  if (t === 'male-double') return 'Men Double';
  if (t === 'female-double') return 'Women Double';
  return 'Open Double';
}

function PlayerChip({ name, gender }: { name: string; gender: string }) {
  const isMale = gender === 'male';
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-50 border border-zinc-100">
      <span className="w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold text-white shrink-0"
        style={{ backgroundColor: isMale ? genderColors.male.accent : genderColors.female.accent }}>
        {name[0]}
      </span>
      {name}
    </span>
  );
}

// ── Session Detail View ──
function SessionDetail({ session, onBack }: { session: SessionInfo; onBack: () => void }) {
  const [attendance, setAttendance] = useState<AttendanceInfo[]>([]);
  const [games, setGames] = useState<GameInfo[]>([]);
  const [payments, setPayments] = useState<PaymentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      window.api.attendanceListBySession(session.id) as Promise<AttendanceInfo[]>,
      window.api.gamesListBySession(session.id) as Promise<GameInfo[]>,
      window.api.paymentsListBySession(session.id) as Promise<PaymentInfo[]>,
    ]).then(([att, gms, pays]) => {
      setAttendance(att);
      setGames(gms);
      setPayments(pays);
      setLoading(false);
    }).catch((err: unknown) => {
      console.error('Failed to load session detail:', err);
      setLoading(false);
    });
  }, [session.id]);

  const totalPaid = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const totalUnpaid = payments.filter(p => p.status !== 'paid').reduce((s, p) => s + p.amount, 0);
  const gamesCompleted = games.filter(g => g.status === 'completed').length;
  const rounds = [...new Set(games.map(g => g.roundNumber))].sort((a, b) => a - b);

  return (
    <div style={{ animation: 'fadeIn 0.2s ease' }}>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-zinc-400 hover:text-zinc-700 transition-colors mb-6">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to sessions
      </button>

      <div className="flex items-end justify-between mb-8">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 tracking-tight">{session.date}</h2>
          <p className="text-sm text-zinc-400 mt-0.5 font-mono tabular-nums">
            {session.courtCount} courts · {formatTime(session.startTime)} → {formatTime(session.endTime)}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            {[0,1,2,3].map(i => <div key={i} className="h-20 skeleton" />)}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3 mb-8">
            <div className="bg-white border border-zinc-200/60 rounded-2xl p-4">
              <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">Checked in</p>
              <p className="text-2xl font-bold text-zinc-900 tabular-nums font-mono mt-1">{attendance.length}</p>
            </div>
            <div className="bg-white border border-zinc-200/60 rounded-2xl p-4">
              <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">Games</p>
              <p className="text-2xl font-bold text-zinc-900 tabular-nums font-mono mt-1">{gamesCompleted}</p>
            </div>
            <div className="bg-white border border-zinc-200/60 rounded-2xl p-4">
              <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">Collected</p>
              <p className="text-2xl font-bold text-emerald-600 tabular-nums font-mono mt-1">${totalPaid.toFixed(0)}</p>
            </div>
            <div className="bg-white border border-zinc-200/60 rounded-2xl p-4">
              <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">Unpaid</p>
              <p className="text-2xl font-bold text-red-500 tabular-nums font-mono mt-1">${totalUnpaid.toFixed(0)}</p>
            </div>
          </div>

          {games.length > 0 && (
            <div className="mb-8">
              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                Games · {rounds.length} round{rounds.length !== 1 ? 's' : ''}
              </p>
              <div className="space-y-4">
                {rounds.map(r => {
                  const roundGames = games.filter(g => g.roundNumber === r);
                  return (
                    <div key={r}>
                      <p className="text-xs font-medium text-zinc-500 mb-2">Round {r}</p>
                      <div className="space-y-2">
                        {roundGames.map(g => (
                          <div key={g.id} className="bg-white border border-zinc-200/60 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-xs font-semibold text-zinc-500">Court {g.courtNumber}</span>
                              <span className="text-zinc-200">·</span>
                              <span className="text-xs text-zinc-400">{gameTypeLabel(g.gameType)}</span>
                              <span className="text-xs text-zinc-300 ml-auto font-medium">{g.status === 'completed' ? 'Completed' : g.status}</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="flex-1">
                                <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-1">Team 1</p>
                                <div className="flex items-center gap-2">
                                  <PlayerChip name={g.t1p1Name} gender={g.t1p1Gender} />
                                  <PlayerChip name={g.t1p2Name} gender={g.t1p2Gender} />
                                </div>
                              </div>
                              <span className="text-[10px] font-bold text-zinc-300 uppercase">vs</span>
                              <div className="flex-1">
                                <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider mb-1">Team 2</p>
                                <div className="flex items-center gap-2">
                                  <PlayerChip name={g.t2p1Name} gender={g.t2p1Gender} />
                                  <PlayerChip name={g.t2p2Name} gender={g.t2p2Gender} />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {attendance.length > 0 && (
            <div className="mb-8">
              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">Attendance · {attendance.length} players</p>
              <div className="bg-white border border-zinc-200/60 rounded-2xl p-4">
                <div className="flex flex-wrap gap-2">
                  {attendance.map(a => (
                    <div key={a.id} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-50 border border-zinc-100">
                      <div className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                        style={{ backgroundColor: a.gender === 'male' ? genderColors.male.accent : genderColors.female.accent }}>
                        {a.name[0]}
                      </div>
                      <span className="text-xs font-medium text-zinc-700">{a.name}</span>
                      <span className="text-[10px] font-mono text-zinc-400">{a.level}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {payments.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">Payments · {payments.length} records</p>
              <div className="bg-white border border-zinc-200/60 rounded-2xl overflow-hidden divide-y divide-zinc-100/80">
                {payments.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                        style={{ backgroundColor: p.status === 'paid' ? '#059669' : '#dc2626' }}>
                        {p.playerName[0]}
                      </div>
                      <span className="text-sm text-zinc-700 font-medium">{p.playerName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-semibold tabular-nums font-mono ${p.status === 'paid' ? 'text-zinc-700' : 'text-red-500'}`}>
                        ${p.amount}
                      </span>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${p.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                        {p.status === 'paid' ? 'Paid' : 'Unpaid'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Session list AG Grid (clickable rows) ──
function SessionsGrid({ sessions, onSelect }: { sessions: SessionInfo[]; onSelect: (id: string) => void }) {
  function CourtsCell({ value }: ICellRendererParams<SessionInfo>) {
    return <span className="text-zinc-500 tabular-nums font-medium">{value} courts</span>;
  }
  function TimeCell({ value }: ICellRendererParams<SessionInfo>) {
    return <span className="text-zinc-500 tabular-nums">{formatTime(value)}</span>;
  }
  function StatusBadge({ data }: ICellRendererParams<SessionInfo>) {
    if (!data) return null;
    const isActive = data.status === 'active';
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
        {isActive ? 'Active' : 'Ended'}
      </span>
    );
  }

  const colDefs: ColDef<SessionInfo>[] = [
    { field: 'date', headerName: 'Date', flex: 1, minWidth: 120, sortable: true, cellClass: 'font-medium text-zinc-900 tabular-nums' },
    { field: 'courtCount', headerName: 'Courts', width: 100, cellRenderer: CourtsCell, sortable: true },
    { field: 'startTime', headerName: 'Start', width: 100, cellRenderer: TimeCell, sortable: true },
    { field: 'endTime', headerName: 'End', width: 100, cellRenderer: TimeCell, sortable: true },
    { field: 'status', headerName: 'Status', width: 110, cellRenderer: StatusBadge, sortable: true },
  ];

  return (
    <div className="bg-white rounded-2xl border border-zinc-200/60 overflow-hidden">
      <div className="ag-theme-quartz" style={{ width: '100%' }}>
        <AgGridReact<SessionInfo>
          rowData={sessions}
          columnDefs={colDefs}
          domLayout="autoHeight"
          rowHeight={44}
          headerHeight={38}
          suppressCellFocus
          suppressRowClickSelection
          onRowClicked={e => { if (e.data) onSelect(e.data.id); }}
        />
      </div>
    </div>
  );
}

// ── Main Sessions Page ──
export function Sessions() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSession, setActiveSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmEndId, setConfirmEndId] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Session detail drill-down
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const load = async () => {
    const [all, active] = await Promise.all([
      window.api.sessionsList(),
      window.api.sessionsGetActive(),
    ]);
    setSessions(all as SessionInfo[]);
    setActiveSession((active as SessionInfo | undefined) ?? null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  const handleCreate = async () => {
    if (activeSession) return;
    const settings = await window.api.settingsGetAll() as Record<string, string>;
    const courtCount = Number(settings.courtCount ?? '4');
    await window.api.sessionsCreate(courtCount);
    load();
  };

  const handleEnd = async (id: string) => {
    await window.api.sessionsEnd(id);
    setConfirmEndId(null);
    load();
  };

  const requestEnd = (id: string) => {
    setConfirmEndId(id);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmEndId(null), 3000);
  };

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

  const selectedSession = sessions.find(s => s.id === selectedSessionId);

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-[90%] mx-auto px-8 py-10" style={{ animation: 'fadeIn 0.3s ease' }}>

        {/* Session detail drill-down */}
        {selectedSessionId && selectedSession ? (
          <SessionDetail session={selectedSession} onBack={() => setSelectedSessionId(null)} />
        ) : (
          <>
            {/* Header */}
            <div className="flex items-end justify-between mb-6">
              <p className="text-sm text-zinc-400">{sessions.length} sessions recorded</p>
              <button
                onClick={handleCreate}
                disabled={!!activeSession}
                className="h-9 px-4 text-sm font-medium bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)] transition-all inline-flex items-center justify-center"
              >
                New Session
              </button>
            </div>

            {/* Active session banner */}
            {activeSession && (
              <div className="relative overflow-hidden rounded-2xl bg-zinc-900 mb-8 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)]">
                <div className="dot-pattern" />
                <div className="relative p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.4)]" />
                      <div>
                        <p className="text-[15px] font-semibold text-white tracking-tight">Current session</p>
                        <p className="text-sm text-zinc-400 mt-0.5 tabular-nums font-medium font-mono">
                          {activeSession.date} · {activeSession.courtCount} courts · {formatTime(activeSession.startTime)} started
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/checkin/${activeSession.id}`}
                        className="h-8 px-3.5 text-sm font-medium bg-white/10 text-white rounded-lg hover:bg-white/15 active:scale-[0.97] transition-all inline-flex items-center justify-center"
                      >
                        Check-in
                      </Link>
                      <Link
                        to={`/match/${activeSession.id}`}
                        className="h-8 px-3.5 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 active:scale-[0.97] shadow-[0_2px_8px_-2px_rgba(5,150,105,0.3)] transition-all inline-flex items-center justify-center"
                      >
                        Match Panel
                      </Link>
                      {confirmEndId === activeSession.id ? (
                        <button onClick={() => handleEnd(activeSession.id)}
                          className="h-8 px-3.5 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 active:scale-[0.97] shadow-[0_2px_8px_-2px_rgba(239,68,68,0.3)] transition-all inline-flex items-center justify-center">
                          Confirm End
                        </button>
                      ) : (
                        <button onClick={() => requestEnd(activeSession.id)}
                          className="h-8 px-3.5 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 active:scale-[0.97] shadow-[0_2px_8px_-2px_rgba(239,68,68,0.3)] transition-all inline-flex items-center justify-center">
                          End
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Session history — clickable rows */}
            {sessions.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">All Sessions</p>
                  <p className="text-[11px] text-zinc-400 tabular-nums font-mono">{sessions.length} records</p>
                </div>
                <SessionsGrid sessions={sessions} onSelect={id => setSelectedSessionId(id)} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center pt-24">
                <div className="w-12 h-12 rounded-2xl bg-zinc-50 flex items-center justify-center mb-4 border border-zinc-100">
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-300">
                    <rect x="2" y="4" width="16" height="12" rx="2" />
                    <path d="M6 4V2.5M14 4V2.5M2 8h16" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-zinc-500 mb-1">No sessions yet</p>
                <p className="text-xs text-zinc-400">Create a session to get started</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
