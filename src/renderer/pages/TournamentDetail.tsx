import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';

const formatLabel = (f: string) => f === 'knockout' ? 'Knockout' : f === 'round_robin' ? 'Round Robin' : 'Mixed';

interface TourData {
  id: string; name: string; description: string; date: string;
  format: string; status: string; courtCount: number; registrationCount: number;
  rounds: string[]; matches: any[];
}

interface RegRow { id: string; player1Id: string; player1Name: string; player1Gender: string; player1Level: number; player2Id: string | null; player2Name: string | null; player2Gender: string | null; player2Level: number | null; }

interface StandingRow {
  player1Id: string; player1Name: string; player2Id: string | null; player2Name: string | null;
  played: number; wins: number; losses: number; pf: number; pa: number; diff: number;
}

interface MatchRow {
  id: string;
  round: string;
  matchNumber: number;
  courtNumber: number | null;
  status: 'pending' | 'in_progress' | 'completed';
  team1Player1Id: string;
  team1Player2Id: string | null;
  team2Player1Id: string;
  team2Player2Id: string | null;
  team1Score: number | null;
  team2Score: number | null;
  winner: 'team1' | 'team2' | null;
  t1p1Name: string;
  t1p1Level: number;
  t1p2Name: string | null;
  t1p2Level: number | null;
  t2p1Name: string;
  t2p1Level: number;
  t2p2Name: string | null;
  t2p2Level: number | null;
}

const isByeMatch = (match: MatchRow) => (
  match.team1Player1Id === match.team2Player1Id &&
  (match.team1Player2Id ?? null) === (match.team2Player2Id ?? null)
);

const formatTeam = (match: MatchRow, side: 'team1' | 'team2') => {
  if (side === 'team1') {
    return `${match.t1p1Name} (Lv${match.t1p1Level})${match.t1p2Name ? ` + ${match.t1p2Name} (Lv${match.t1p2Level})` : ''}`;
  }
  return `${match.t2p1Name} (Lv${match.t2p1Level})${match.t2p2Name ? ` + ${match.t2p2Name} (Lv${match.t2p2Level})` : ''}`;
};

function ScoreModal({ match, onClose, onSaved }: { match: any; onClose: () => void; onSaved: () => void }) {
  const [sc1, setSc1] = useState(match.team1Score != null ? String(match.team1Score) : '');
  const [sc2, setSc2] = useState(match.team2Score != null ? String(match.team2Score) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const s1 = Number(sc1); const s2 = Number(sc2);
    if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) {
      setError('Enter valid non-negative scores.');
      return;
    }
    if (s1 === s2) {
      setError('Tournament matches need a winner.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await window.api.tournamentsSetScore(match.id, s1, s2);
      onSaved();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save score.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-[380px] max-w-[90vw]" onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 24px 48px -12px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.04)', animation: 'ctxFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        <h3 className="text-lg font-bold text-zinc-900 mb-4">Enter Score</h3>
        <div className="space-y-3 mb-4">
          <div className="text-sm font-semibold text-zinc-700 bg-zinc-50 rounded-lg p-3">
            <span className="text-zinc-400 text-xs">Team 1</span><br />
            {match.t1p1Name} ({match.t1p1Level}){match.t1p2Name ? ` + ${match.t1p2Name} (${match.t1p2Level})` : ''}
          </div>
          <div className="flex items-center gap-3 justify-center">
            <input type="number" min="0" value={sc1} onChange={e => setSc1(e.target.value)}
              className="w-16 px-3 py-2 text-sm font-mono text-center border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400" />
            <span className="text-zinc-400 font-bold text-sm">vs</span>
            <input type="number" min="0" value={sc2} onChange={e => setSc2(e.target.value)}
              className="w-16 px-3 py-2 text-sm font-mono text-center border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400" />
          </div>
          <div className="text-sm font-semibold text-zinc-700 bg-zinc-50 rounded-lg p-3">
            <span className="text-zinc-400 text-xs">Team 2</span><br />
            {match.t2p1Name} ({match.t2p1Level}){match.t2p2Name ? ` + ${match.t2p2Name} (${match.t2p2Level})` : ''}
          </div>
        </div>
        {error && <p className="mb-3 text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 rounded-xl">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-sm font-semibold bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 active:scale-[0.97] transition-all disabled:opacity-40">Save</button>
        </div>
      </div>
    </div>
  );
}

export function TournamentDetail() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<TourData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'registration' | 'bracket' | 'standings'>('overview');
  const [regs, setRegs] = useState<RegRow[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [showAddReg, setShowAddReg] = useState(false);
  const [regPlayer1, setRegPlayer1] = useState('');
  const [regPlayer2, setRegPlayer2] = useState('');
  const [regMode, setRegMode] = useState<'individual' | 'pair'>('individual');
  const [scoreMatch, setScoreMatch] = useState<MatchRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [regError, setRegError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'generate' | 'advance' | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [t, r, p, s] = await Promise.all([
      window.api.tournamentsGet(id) as Promise<TourData>,
      window.api.tournamentsRegistrations(id) as Promise<RegRow[]>,
      window.api.playersList() as Promise<any[]>,
      window.api.tournamentsStandings(id) as Promise<StandingRow[]>,
    ]);
    setData(t); setRegs(r); setPlayers(p); setStandings(s);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleRegister = async () => {
    if (!id || !regPlayer1) return;
    if (regMode === 'pair' && !regPlayer2) return;
    setRegError(null);
    try {
      await window.api.tournamentsRegister(id, regPlayer1, regMode === 'pair' ? regPlayer2 : undefined);
      setShowAddReg(false); setRegPlayer1(''); setRegPlayer2('');
      setTab('registration');
      load();
    } catch (err: any) {
      setRegError(err?.message ?? 'Failed to register player.');
    }
  };

  const handleGenerate = async () => {
    if (!id || !data) return;
    setActionError(null);
    if (regs.length < 2) {
      setActionError('Register at least two teams before generating a schedule.');
      setTab('registration');
      return;
    }

    const hasCompletedMatches = data.matches.some((m: MatchRow) => m.status === 'completed' && !isByeMatch(m));
    if (data.matches.length > 0) {
      const message = hasCompletedMatches
        ? 'Regenerating will delete the current schedule and completed scores. Continue?'
        : 'Regenerating will replace the current schedule. Continue?';
      if (!window.confirm(message)) return;
    }

    setBusyAction('generate');
    try {
      await window.api.tournamentsGenerateBracket(id);
      setTab('bracket');
      await load();
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to generate schedule.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleAdvance = async () => {
    if (!id || !data) return;
    const lastRound = data.rounds[data.rounds.length - 1];
    if (!lastRound) return;
    setActionError(null);
    setBusyAction('advance');
    try {
      await window.api.tournamentsAdvanceWinners(id, lastRound);
      setTab('bracket');
      await load();
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to advance winners.');
    } finally {
      setBusyAction(null);
    }
  };

  const regCols: any[] = useMemo(() => [
    { headerName: 'Player 1', field: 'player1Name', flex: 2, cellRenderer: (p: any) => <span className="font-bold">{p.value}</span> },
    { headerName: 'Lv', field: 'player1Level', width: 50 },
    { headerName: 'Player 2', field: 'player2Name', flex: 2, valueFormatter: (p: any) => p.value || '—' },
    { headerName: 'Lv', field: 'player2Level', width: 50, valueFormatter: (p: any) => p.value != null ? p.value : '—' },
  ], []);

  const standingsCols: any[] = useMemo(() => [
    { headerName: 'Team', field: 'player1Name', flex: 2, cellRenderer: (p: any) => p.data?.player2Name ? `${p.value} / ${p.data.player2Name}` : p.value },
    { headerName: 'P', field: 'played', width: 50 },
    { headerName: 'W', field: 'wins', width: 50, cellRenderer: (p: any) => <span className="text-emerald-600">{p.value}</span> },
    { headerName: 'L', field: 'losses', width: 50, cellRenderer: (p: any) => <span className="text-red-500">{p.value}</span> },
    { headerName: 'PF', field: 'pf', width: 60 },
    { headerName: 'PA', field: 'pa', width: 60 },
    { headerName: 'Diff', field: 'diff', width: 60, cellRenderer: (p: any) => <span className={p.value >= 0 ? 'text-emerald-600' : 'text-red-500'}>{p.value > 0 ? `+${p.value}` : p.value}</span> },
  ], []);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-48 h-4 skeleton" /></div>;
  if (!data) return <div className="flex items-center justify-center h-full text-sm text-zinc-400">Tournament not found</div>;

  const registeredIds = new Set(regs.map(r => r.player1Id));
  regs.forEach(r => { if (r.player2Id) registeredIds.add(r.player2Id); });
  const availablePlayers = players.filter(p => !registeredIds.has(p.id));
  const matches = data.matches as MatchRow[];
  const realMatches = matches.filter(m => !isByeMatch(m));
  const pendingRealMatches = realMatches.filter(m => m.status !== 'completed');
  const completedRealMatches = realMatches.filter(m => m.status === 'completed');
  const lastRound = data.rounds[data.rounds.length - 1];
  const lastRoundMatches = lastRound ? matches.filter(m => m.round === lastRound) : [];
  const canAdvance = data.format === 'knockout'
    && Boolean(lastRound)
    && lastRound !== 'F'
    && lastRoundMatches.length > 0
    && lastRoundMatches.every(m => m.status === 'completed');
  const nextAction = regs.length < 2
    ? 'Register at least two teams'
    : matches.length === 0
      ? 'Generate the schedule'
      : pendingRealMatches.length > 0
        ? `Enter ${pendingRealMatches.length} remaining score${pendingRealMatches.length === 1 ? '' : 's'}`
        : canAdvance
          ? `Advance winners from ${lastRound}`
          : 'Review standings';
  const steps = [
    { label: 'Setup', done: true },
    { label: 'Register', done: regs.length >= 2 },
    { label: 'Schedule', done: matches.length > 0 },
    { label: 'Play', done: matches.length > 0 && pendingRealMatches.length === 0 },
    { label: 'Standings', done: completedRealMatches.length > 0 },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-[90%] mx-auto px-8 py-10" style={{ animation: 'fadeIn 0.3s ease' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 tracking-tight">{data.name}</h2>
            <p className="text-sm text-zinc-400">{data.date} · {formatLabel(data.format)} · {data.courtCount} courts</p>
          </div>
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${data.status === 'active' ? 'bg-emerald-50 text-emerald-700' : data.status === 'completed' ? 'bg-zinc-100 text-zinc-500' : 'bg-blue-50 text-blue-700'}`}>{data.status}</span>
        </div>

        <div className="mt-5 mb-5 border border-zinc-200/70 bg-white rounded-xl p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">Current step</p>
              <p className="text-sm font-semibold text-zinc-900">{nextAction}</p>
              {actionError && <p className="mt-2 text-xs font-medium text-red-600">{actionError}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => { setRegError(null); setShowAddReg(true); setTab('registration'); }}
                className="h-8 px-3 text-sm font-medium border border-zinc-200 text-zinc-700 rounded-lg hover:bg-zinc-50 active:scale-[0.97] transition-all">
                Register
              </button>
              <button onClick={handleGenerate} disabled={busyAction !== null || regs.length < 2}
                className={`h-8 px-3 text-sm font-semibold rounded-lg active:scale-[0.97] transition-all disabled:opacity-40 ${matches.length > 0 ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                {busyAction === 'generate' ? 'Generating...' : matches.length > 0 ? 'Regenerate' : 'Generate Schedule'}
              </button>
              {data.format === 'knockout' && (
                <button onClick={handleAdvance} disabled={!canAdvance || busyAction !== null}
                  className="h-8 px-3 text-sm font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 active:scale-[0.97] transition-all disabled:opacity-40">
                  {busyAction === 'advance' ? 'Advancing...' : 'Advance Winners'}
                </button>
              )}
              <button onClick={() => setTab('standings')}
                className="h-8 px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50 rounded-lg transition-colors">
                View Standings
              </button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
            {steps.map((step, index) => (
              <div key={step.label}
                className={`rounded-lg border px-3 py-2 ${step.done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-zinc-200 bg-zinc-50 text-zinc-400'}`}>
                <p className="text-[11px] font-mono tabular-nums">{String(index + 1).padStart(2, '0')}</p>
                <p className="text-xs font-semibold">{step.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 mt-4">
          {(['overview', 'registration', 'bracket', 'standings'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors capitalize ${tab === t ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600'}`}
            >{t}</button>
          ))}
        </div>

        {/* Overview */}
        {tab === 'overview' && (
          <div className="max-w-lg">
            {data.description && <p className="text-sm text-zinc-500 mb-4">{data.description}</p>}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white border border-zinc-200/60 rounded-2xl p-5">
                <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider mb-1">Registrations</p>
                <p className="text-3xl font-bold text-zinc-900 tabular-nums font-mono">{data.registrationCount}</p>
              </div>
              <div className="bg-white border border-zinc-200/60 rounded-2xl p-5">
                <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider mb-1">Rounds</p>
                <p className="text-3xl font-bold text-zinc-900 tabular-nums font-mono">{data.rounds.length}</p>
              </div>
            </div>
          </div>
        )}

        {/* Registration */}
        {tab === 'registration' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-zinc-400">{regs.length} registered</p>
              <button onClick={() => setShowAddReg(true)} className="h-8 px-3 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 active:scale-[0.97] transition-all inline-flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Register
              </button>
            </div>
            <div className="ag-theme-quartz" style={{ width: '100%' }}>
              <AgGridReact rowData={regs} columnDefs={regCols} defaultColDef={{ sortable: true, resizable: true }} domLayout="autoHeight" rowHeight={36} headerHeight={38} />
            </div>

            {showAddReg && (
              <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowAddReg(false)}>
                <div className="bg-white rounded-2xl p-6 w-[400px] max-w-[90vw]" onClick={e => e.stopPropagation()}
                  style={{ boxShadow: '0 24px 48px -12px rgba(0,0,0,0.2)', animation: 'ctxFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                  <h3 className="text-lg font-bold text-zinc-900 mb-4">Register</h3>
                  <div className="flex gap-2 mb-4">
                    <button onClick={() => { setRegMode('individual'); setRegError(null); }} className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-all ${regMode === 'individual' ? 'bg-zinc-800 border-zinc-900 text-white' : 'bg-white border-zinc-200 text-zinc-500'}`}>Individual</button>
                    <button onClick={() => { setRegMode('pair'); setRegError(null); }} className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-all ${regMode === 'pair' ? 'bg-zinc-800 border-zinc-900 text-white' : 'bg-white border-zinc-200 text-zinc-500'}`}>Pair</button>
                  </div>
                  <div className="space-y-3">
                    <select value={regPlayer1} onChange={e => setRegPlayer1(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400">
                      <option value="">Select player 1</option>
                      {availablePlayers.map(p => <option key={p.id} value={p.id}>{p.name} — Lv{p.level} ({p.gender})</option>)}
                    </select>
                    {regMode === 'pair' && (
                      <select value={regPlayer2} onChange={e => setRegPlayer2(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400">
                        <option value="">Select player 2</option>
                        {availablePlayers.filter(p => p.id !== regPlayer1).map(p => <option key={p.id} value={p.id}>{p.name} — Lv{p.level} ({p.gender})</option>)}
                      </select>
                    )}
                  </div>
                  {regError && <p className="mt-3 text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{regError}</p>}
                  <div className="flex justify-end gap-2 mt-5">
                    <button onClick={() => setShowAddReg(false)} className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 rounded-xl">Cancel</button>
                    <button onClick={handleRegister} disabled={!regPlayer1 || (regMode === 'pair' && !regPlayer2)} className="px-5 py-2 text-sm font-semibold bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 active:scale-[0.97] transition-all disabled:opacity-40">Register</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bracket */}
        {tab === 'bracket' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-zinc-400">{matches.length} matches · {data.rounds.length} rounds · {pendingRealMatches.length} pending</p>
            </div>
            {data.rounds.map(round => {
              const roundMatches = matches.filter((m: MatchRow) => m.round === round);
              return (
                <div key={round} className="mb-6">
                  <h3 className="text-sm font-bold text-zinc-700 mb-2">{round}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {roundMatches.map((m: MatchRow) => {
                      const bye = isByeMatch(m);
                      return (
                      <div key={m.id}
                        className={`bg-white border border-zinc-200/60 rounded-xl p-4 transition-all ${bye ? 'opacity-80' : 'hover:border-zinc-300'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-semibold text-zinc-400 uppercase">{bye ? 'Auto-advance' : `Court ${m.courtNumber ?? '—'}`}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${m.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : m.status === 'in_progress' ? 'bg-amber-50 text-amber-700' : 'bg-zinc-100 text-zinc-500'}`}>{m.status}</span>
                            {!bye && (
                              <button onClick={() => setScoreMatch(m)}
                                className="h-6 px-2 text-[11px] font-semibold text-zinc-700 border border-zinc-200 rounded-md hover:bg-zinc-50 active:scale-[0.97] transition-all">
                                {m.status === 'completed' ? 'Edit Score' : 'Enter Score'}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-bold text-zinc-800">{formatTeam(m, 'team1')}</p>
                          </div>
                          <span className="text-sm font-mono font-bold mx-3 text-zinc-400">{m.team1Score != null ? m.team1Score : '—'} : {m.team2Score != null ? m.team2Score : '—'}</span>
                          <div className="flex-1 text-right">
                            <p className="text-sm font-bold text-zinc-800">{formatTeam(m, 'team2')}</p>
                          </div>
                        </div>
                        {m.winner && (
                          <div className="mt-2 pt-2 border-t border-zinc-100 text-[11px] text-emerald-600 font-medium">
                            Winner: {m.winner === 'team1' ? m.t1p1Name + (m.t1p2Name ? ` / ${m.t1p2Name}` : '') : m.t2p1Name + (m.t2p2Name ? ` / ${m.t2p2Name}` : '')}
                          </div>
                        )}
                      </div>
                    );})}
                  </div>
                </div>
              );
            })}
            {matches.length === 0 && <p className="text-sm text-zinc-400">No matches yet. Register players and generate the schedule.</p>}
          </div>
        )}

        {/* Standings */}
        {tab === 'standings' && (
          <div>
            <div className="ag-theme-quartz" style={{ width: '100%' }}>
              <AgGridReact rowData={standings} columnDefs={standingsCols} defaultColDef={{ sortable: true, resizable: true, flex: 1 }} domLayout="autoHeight" rowHeight={36} headerHeight={38} />
            </div>
            {standings.length === 0 && <p className="text-sm text-zinc-400 mt-4">No completed matches yet.</p>}
          </div>
        )}
      </div>

      {scoreMatch && <ScoreModal match={scoreMatch} onClose={() => setScoreMatch(null)} onSaved={() => { setScoreMatch(null); load(); }} />}
    </div>
  );
}
