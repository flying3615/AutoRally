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

function ScoreModal({ match, onClose, onSaved }: { match: any; onClose: () => void; onSaved: () => void }) {
  const [sc1, setSc1] = useState(match.team1Score != null ? String(match.team1Score) : '');
  const [sc2, setSc2] = useState(match.team2Score != null ? String(match.team2Score) : '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const s1 = Number(sc1); const s2 = Number(sc2);
    if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) return;
    setSaving(true);
    await window.api.tournamentsSetScore(match.id, s1, s2);
    setSaving(false);
    onSaved();
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
  const [scoreMatch, setScoreMatch] = useState<any>(null);

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
    await window.api.tournamentsRegister(id, regPlayer1, regMode === 'pair' ? regPlayer2 : undefined);
    setShowAddReg(false); setRegPlayer1(''); setRegPlayer2('');
    load();
  };

  const handleGenerate = async () => {
    if (!id || !data) return;
    await window.api.tournamentsGenerateBracket(id);
    load();
  };

  const handleAdvance = async () => {
    if (!id || !data) return;
    const lastRound = data.rounds[data.rounds.length - 1];
    if (!lastRound) return;
    await window.api.tournamentsAdvanceWinners(id, lastRound);
    load();
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
                    <button onClick={() => setRegMode('individual')} className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-all ${regMode === 'individual' ? 'bg-zinc-800 border-zinc-900 text-white' : 'bg-white border-zinc-200 text-zinc-500'}`}>Individual</button>
                    <button onClick={() => setRegMode('pair')} className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-all ${regMode === 'pair' ? 'bg-zinc-800 border-zinc-900 text-white' : 'bg-white border-zinc-200 text-zinc-500'}`}>Pair</button>
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
                  <div className="flex justify-end gap-2 mt-5">
                    <button onClick={() => setShowAddReg(false)} className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 rounded-xl">Cancel</button>
                    <button onClick={handleRegister} disabled={!regPlayer1} className="px-5 py-2 text-sm font-semibold bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 active:scale-[0.97] transition-all disabled:opacity-40">Register</button>
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
              <p className="text-sm text-zinc-400">{data.matches.length} matches · {data.rounds.length} rounds</p>
              <div className="flex gap-2">
                <button onClick={handleGenerate} className="h-8 px-3 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 active:scale-[0.97] transition-all">Generate Bracket</button>
                <button onClick={handleAdvance} className="h-8 px-3 text-sm font-medium bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 active:scale-[0.97] transition-all">Advance Winners</button>
              </div>
            </div>
            {data.rounds.map(round => {
              const roundMatches = data.matches.filter((m: any) => m.round === round);
              return (
                <div key={round} className="mb-6">
                  <h3 className="text-sm font-bold text-zinc-700 mb-2">{round}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {roundMatches.map((m: any) => (
                      <div key={m.id} onClick={() => setScoreMatch(m)}
                        className="bg-white border border-zinc-200/60 rounded-xl p-4 hover:border-zinc-300 cursor-pointer transition-all">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-semibold text-zinc-400 uppercase">Court {m.courtNumber ?? '—'}</span>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${m.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : m.status === 'in_progress' ? 'bg-amber-50 text-amber-700' : 'bg-zinc-100 text-zinc-500'}`}>{m.status}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-bold text-zinc-800">{m.t1p1Name} (Lv{m.t1p1Level}){m.t1p2Name ? ` + ${m.t1p2Name} (Lv${m.t1p2Level})` : ''}</p>
                          </div>
                          <span className="text-sm font-mono font-bold mx-3 text-zinc-400">{m.team1Score != null ? m.team1Score : '—'} : {m.team2Score != null ? m.team2Score : '—'}</span>
                          <div className="flex-1 text-right">
                            <p className="text-sm font-bold text-zinc-800">{m.t2p1Name} (Lv{m.t2p1Level}){m.t2p2Name ? ` + ${m.t2p2Name} (Lv${m.t2p2Level})` : ''}</p>
                          </div>
                        </div>
                        {m.winner && (
                          <div className="mt-2 pt-2 border-t border-zinc-100 text-[11px] text-emerald-600 font-medium">
                            Winner: {m.winner === 'team1' ? m.t1p1Name + (m.t1p2Name ? ` / ${m.t1p2Name}` : '') : m.t2p1Name + (m.t2p2Name ? ` / ${m.t2p2Name}` : '')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {data.matches.length === 0 && <p className="text-sm text-zinc-400">No matches yet. Register players and generate the bracket.</p>}
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
