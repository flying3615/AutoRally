import { useEffect, useState, useRef } from 'react';

interface PlayerInfo {
  id: string;
  name: string;
  gender: string;
  level: number;
  balance: number;
}

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
  startedAt: string | null;
  endedAt: string | null;
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

const formatTime = (t: string | null) =>
  t ? new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-';

function gameTypeLabel(gameType: string): string {
  if (gameType === 'mixed') return 'Mixed';
  if (gameType === 'male-double') return 'Men Double';
  if (gameType === 'female-double') return 'Women Double';
  return 'Open Double';
}

export function History() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [stats, setStats] = useState<{ sessionCount: number; gameCount: number } | null>(null);
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Session detail state
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [detailAttendance, setDetailAttendance] = useState<AttendanceInfo[]>([]);
  const [detailGames, setDetailGames] = useState<GameInfo[]>([]);
  const [detailPayments, setDetailPayments] = useState<PaymentInfo[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    window.api.sessionsList().then(s => setSessions(s as SessionInfo[]));
    window.api.playersList().then(p => setPlayers(p as PlayerInfo[]));
  }, []);

  useEffect(() => {
    if (selectedPlayer) {
      window.api.historyPlayerStats(selectedPlayer).then(s => setStats(s as { sessionCount: number; gameCount: number }));
    } else {
      setStats(null);
    }
  }, [selectedPlayer]);

  // Load session detail
  useEffect(() => {
    if (!selectedSessionId) return;
    setDetailLoading(true);
    Promise.all([
      window.api.attendanceListBySession(selectedSessionId) as Promise<AttendanceInfo[]>,
      window.api.gamesListBySession(selectedSessionId) as Promise<GameInfo[]>,
      window.api.paymentsListBySession(selectedSessionId) as Promise<PaymentInfo[]>,
    ]).then(([att, games, payments]) => {
      setDetailAttendance(att);
      setDetailGames(games);
      setDetailPayments(payments);
      setDetailLoading(false);
    });
  }, [selectedSessionId]);

  // Close picker on click outside
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  const completedSessions = sessions.filter(s => s.status === 'completed');
  const selectedPlayerInfo = players.find(p => p.id === selectedPlayer);
  const selectedSession = sessions.find(s => s.id === selectedSessionId);

  const filtered = search.trim()
    ? players.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : players;

  // Session detail computed values
  const totalPaid = detailPayments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const totalUnpaid = detailPayments.filter(p => p.status !== 'paid').reduce((s, p) => s + p.amount, 0);
  const gamesCompleted = detailGames.filter(g => g.status === 'completed').length;
  const rounds = [...new Set(detailGames.map(g => g.roundNumber))].sort((a, b) => a - b);

  // ── Session Detail View ──
  if (selectedSessionId && selectedSession) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-10" style={{ animation: 'fadeIn 0.2s ease' }}>

          {/* Back header */}
          <button
            onClick={() => setSelectedSessionId(null)}
            className="flex items-center gap-1.5 text-sm font-medium text-zinc-400 hover:text-zinc-700 transition-colors mb-6"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back to history
          </button>

          {/* Session header */}
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="text-xl font-bold text-zinc-900 tracking-tight">
                {selectedSession.date}
              </h2>
              <p className="text-sm text-zinc-400 mt-0.5 font-mono tabular-nums">
                {selectedSession.courtCount} courts · {formatTime(selectedSession.startTime)} → {formatTime(selectedSession.endTime)}
              </p>
            </div>
          </div>

          {detailLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                {[0,1,2,3].map(i => <div key={i} className="h-20 skeleton" />)}
              </div>
              <div className="h-40 skeleton" />
              <div className="h-32 skeleton" />
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-3 mb-8">
                <div className="bg-white border border-zinc-200/60 rounded-2xl p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.04)]">
                  <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">Checked in</p>
                  <p className="text-2xl font-bold text-zinc-900 tabular-nums tracking-tight font-mono mt-1">{detailAttendance.length}</p>
                </div>
                <div className="bg-white border border-zinc-200/60 rounded-2xl p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.04)]">
                  <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">Games</p>
                  <p className="text-2xl font-bold text-zinc-900 tabular-nums tracking-tight font-mono mt-1">{gamesCompleted}</p>
                </div>
                <div className="bg-white border border-zinc-200/60 rounded-2xl p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.04)]">
                  <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">Collected</p>
                  <p className="text-2xl font-bold text-emerald-600 tabular-nums tracking-tight font-mono mt-1">${totalPaid.toFixed(0)}</p>
                </div>
                <div className="bg-white border border-zinc-200/60 rounded-2xl p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.04)]">
                  <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">Unpaid</p>
                  <p className="text-2xl font-bold text-red-500 tabular-nums tracking-tight font-mono mt-1">${totalUnpaid.toFixed(0)}</p>
                </div>
              </div>

              {/* Games section */}
              {detailGames.length > 0 && (
                <div className="mb-8">
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                    Games · {rounds.length} round{rounds.length !== 1 ? 's' : ''}
                  </p>
                  <div className="space-y-4">
                    {rounds.map(r => {
                      const roundGames = detailGames.filter(g => g.roundNumber === r);
                      return (
                        <div key={r}>
                          <p className="text-xs font-medium text-zinc-500 mb-2">Round {r}</p>
                          <div className="space-y-2">
                            {roundGames.map(g => (
                              <div
                                key={g.id}
                                className="bg-white border border-zinc-200/60 rounded-xl p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.04)]"
                              >
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

              {/* Attendance grid */}
              {detailAttendance.length > 0 && (
                <div className="mb-8">
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                    Attendance · {detailAttendance.length} players
                  </p>
                  <div className="bg-white border border-zinc-200/60 rounded-2xl p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.04)]">
                    <div className="flex flex-wrap gap-2">
                      {detailAttendance.map(a => (
                        <div
                          key={a.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-50 border border-zinc-100"
                        >
                          <div
                            className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                            style={{ backgroundColor: a.gender === 'male' ? '#3b82f6' : '#ec4899' }}
                          >
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

              {/* Payments list */}
              {detailPayments.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                    Payments · {detailPayments.length} records
                  </p>
                  <div className="bg-white border border-zinc-200/60 rounded-2xl overflow-hidden divide-y divide-zinc-100/80 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.04)]">
                    {detailPayments.map(p => (
                      <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                            style={{ backgroundColor: p.status === 'paid' ? '#059669' : '#dc2626' }}
                          >
                            {p.playerName[0]}
                          </div>
                          <span className="text-sm text-zinc-700 font-medium">{p.playerName}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-semibold tabular-nums font-mono ${p.status === 'paid' ? 'text-zinc-700' : 'text-red-500'}`}>
                            ${p.amount}
                          </span>
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${
                            p.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                          }`}>
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
      </div>
    );
  }

  // ── Main History View ──
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-10" style={{ animation: 'fadeIn 0.3s ease' }}>

        {/* Header */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-zinc-900 tracking-tight">History</h2>
          <p className="text-sm text-zinc-400 mt-0.5">Player attendance and match statistics</p>
        </div>

        {/* Player stats section */}
        <div className="mb-8">
          <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">Player statistics</label>

          {/* Search picker */}
          <div ref={pickerRef} className="relative mb-5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPickerOpen(true); }}
                  onFocus={() => setPickerOpen(true)}
                  placeholder={selectedPlayerInfo ? selectedPlayerInfo.name : 'Search player...'}
                  className="w-full h-9 pl-9 pr-3 text-sm bg-white border border-zinc-200 rounded-lg
                    focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 transition-all"
                />
              </div>
              {selectedPlayerInfo && (
                <button
                  onClick={() => { setSelectedPlayer(null); setSearch(''); }}
                  className="h-9 px-3 text-xs font-medium text-zinc-500 bg-zinc-100 rounded-lg hover:bg-zinc-200 active:scale-95 transition-all inline-flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear
                </button>
              )}
            </div>

            {/* Dropdown */}
            {pickerOpen && (
              <div
                className="absolute z-50 mt-1 w-full max-w-sm bg-white border border-zinc-200 rounded-xl shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] overflow-hidden"
                style={{ animation: 'ctxFadeIn 0.12s cubic-bezier(0.16, 1, 0.3, 1)' }}
              >
                <div className="max-h-64 overflow-auto">
                  {filtered.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <p className="text-sm text-zinc-400">No players found</p>
                    </div>
                  ) : (
                    filtered.map(p => {
                      const isMale = p.gender === 'male';
                      const active = selectedPlayer === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            setSelectedPlayer(active ? null : p.id);
                            setPickerOpen(false);
                            setSearch('');
                          }}
                          className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                            active
                              ? 'bg-zinc-800 text-white'
                              : 'hover:bg-zinc-50'
                          }`}
                        >
                          <div
                            className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                            style={{ backgroundColor: active ? 'rgba(255,255,255,0.2)' : isMale ? '#3b82f6' : '#ec4899' }}
                          >
                            {p.name[0]}
                          </div>
                          <span className="text-sm font-medium flex-1 truncate">{p.name}</span>
                          <span className="text-[11px] font-mono tabular-nums text-zinc-400">
                            Lv{p.level}
                          </span>
                          <span className="text-[11px] font-medium text-zinc-400">
                            {isMale ? 'M' : 'F'}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
                {filtered.length > 0 && (
                  <div className="px-4 py-2 border-t border-zinc-100 text-[11px] text-zinc-400 font-medium">
                    {filtered.length} player{filtered.length !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stats cards */}
          {stats && selectedPlayerInfo && (
            <div
              className="relative overflow-hidden rounded-2xl bg-zinc-900 p-6 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)]"
              style={{ animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}
            >
              <div className="dot-pattern" />
              <div className="relative">
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white"
                    style={{ backgroundColor: selectedPlayerInfo.gender === 'male' ? '#3b82f6' : '#ec4899' }}
                  >
                    {selectedPlayerInfo.name[0]}
                  </div>
                  <div>
                    <p className="text-[15px] font-bold text-white tracking-tight">{selectedPlayerInfo.name}</p>
                    <p className="text-xs text-zinc-400 font-medium">
                      {selectedPlayerInfo.gender === 'male' ? 'M' : 'F'} · Lv{selectedPlayerInfo.level}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl bg-white/10 px-4 py-3">
                    <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">Sessions</p>
                    <p className="text-2xl font-bold text-white tabular-nums tracking-tight font-mono mt-1">{stats.sessionCount}</p>
                  </div>
                  <div className="rounded-xl bg-white/10 px-4 py-3">
                    <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">Matches</p>
                    <p className="text-2xl font-bold text-white tabular-nums tracking-tight font-mono mt-1">{stats.gameCount}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Session history */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Session history</p>
            {completedSessions.length > 0 && (
              <p className="text-[11px] text-zinc-400 tabular-nums font-mono">{completedSessions.length} records</p>
            )}
          </div>

          {completedSessions.length > 0 ? (
            <div className="bg-white border border-zinc-200/60 rounded-2xl overflow-hidden divide-y divide-zinc-100/80 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.04)]">
              {completedSessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSessionId(s.id)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-zinc-50/50 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-5">
                    <span className="text-sm font-medium text-zinc-900 tabular-nums font-mono min-w-[90px]">{s.date}</span>
                    <span className="text-sm text-zinc-400 tabular-nums font-mono font-medium">{s.courtCount} courts</span>
                    <span className="text-sm text-zinc-400 tabular-nums font-mono min-w-[44px]">{formatTime(s.startTime)}</span>
                    <span className="text-zinc-300">→</span>
                    <span className="text-sm text-zinc-400 tabular-nums font-mono min-w-[44px]">{formatTime(s.endTime)}</span>
                  </div>
                  <svg className="w-4 h-4 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
              <div className="w-12 h-12 rounded-2xl bg-zinc-50 flex items-center justify-center mb-4 border border-zinc-100">
                <svg className="w-6 h-6 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-zinc-500">No history yet</p>
              <p className="text-xs mt-1 text-zinc-400">Records appear after ending a session</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerChip({ name, gender }: { name: string; gender: string }) {
  const isMale = gender === 'male';
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-50 border border-zinc-100">
      <span
        className="w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold text-white shrink-0"
        style={{ backgroundColor: isMale ? '#3b82f6' : '#ec4899' }}
      >
        {name[0]}
      </span>
      {name}
    </span>
  );
}
