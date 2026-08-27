import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import { confirm } from '../stores/confirmStore';
import { SetScoreModal } from '../components/SetScoreModal';

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
  set1Team1Score: number | null;
  set1Team2Score: number | null;
  set2Team1Score: number | null;
  set2Team2Score: number | null;
  set3Team1Score: number | null;
  set3Team2Score: number | null;
  winner: 'team1' | 'team2' | null;
  t1p1Name: string;
  t1p1Level: number;
  t1p2Name: string | null;
  t1p2Level: number | null;
  t2p1Name: string;
  t2p1Level: number;
  t2p2Name: string | null;
  t2p2Level: number | null;
  teamMatchId: string | null;
  category: 'MS' | 'WS' | 'MD' | 'XD' | 'WD' | null;
  slotNumber: number | null;
}

const isByeMatch = (match: MatchRow) => (
  match.team1Player1Id === match.team2Player1Id &&
  (match.team1Player2Id ?? null) === (match.team2Player2Id ?? null)
);

const formatSetScores = (m: MatchRow): string | null => {
  const sets = [
    [m.set1Team1Score, m.set1Team2Score],
    [m.set2Team1Score, m.set2Team2Score],
    [m.set3Team1Score, m.set3Team2Score],
  ].filter((s): s is [number, number] => s[0] != null && s[1] != null);
  if (sets.length === 0) return null;
  return sets.map(([a, b]) => `${a}-${b}`).join(', ');
};

const formatTeam = (match: MatchRow, side: 'team1' | 'team2') => {
  if (side === 'team1') {
    return `${match.t1p1Name} (Lv${match.t1p1Level})${match.t1p2Name ? ` + ${match.t1p2Name} (Lv${match.t1p2Level})` : ''}`;
  }
  return `${match.t2p1Name} (Lv${match.t2p1Level})${match.t2p2Name ? ` + ${match.t2p2Name} (Lv${match.t2p2Level})` : ''}`;
};

function ScoreModal({ match, onClose, onSaved }: { match: MatchRow; onClose: () => void; onSaved: () => void }) {
  const initialSets = [
    match.set1Team1Score != null && match.set1Team2Score != null ? { team1: match.set1Team1Score, team2: match.set1Team2Score } : null,
    match.set2Team1Score != null && match.set2Team2Score != null ? { team1: match.set2Team1Score, team2: match.set2Team2Score } : null,
    match.set3Team1Score != null && match.set3Team2Score != null ? { team1: match.set3Team1Score, team2: match.set3Team2Score } : null,
  ].filter((s): s is { team1: number; team2: number } => s !== null);

  return (
    <SetScoreModal
      title="Enter Score"
      team1Label={`${match.t1p1Name}${match.t1p2Name ? ` / ${match.t1p2Name}` : ''}`}
      team2Label={`${match.t2p1Name}${match.t2p2Name ? ` / ${match.t2p2Name}` : ''}`}
      initialSets={initialSets}
      onCancel={onClose}
      onSave={async sets => {
        await window.api.tournamentsSetScore(match.id, sets);
        onSaved();
      }}
    />
  );
}

function EditPlayersModal({ match, team1Id, team2Id, onClose, onSaved }: {
  match: MatchRow;
  team1Id: string;
  team2Id: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isDoubles = match.category === 'MD' || match.category === 'WD' || match.category === 'XD';
  const [team1Players, setTeam1Players] = useState<any[]>([]);
  const [team2Players, setTeam2Players] = useState<any[]>([]);
  const [t1p1, setT1p1] = useState(match.team1Player1Id);
  const [t1p2, setT1p2] = useState(match.team1Player2Id ?? '');
  const [t2p1, setT2p1] = useState(match.team2Player1Id);
  const [t2p2, setT2p2] = useState(match.team2Player2Id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (window.api as any).tournamentTeamsListPlayers(team1Id).then(setTeam1Players);
    (window.api as any).tournamentTeamsListPlayers(team2Id).then(setTeam2Players);
  }, [team1Id, team2Id]);

  const genderFor = (category: string, slot: 1 | 2): 'male' | 'female' => {
    if (category === 'MS' || category === 'MD') return 'male';
    if (category === 'WS' || category === 'WD') return 'female';
    return slot === 1 ? 'male' : 'female'; // XD
  };

  const optionsFor = (players: any[], category: string, slot: 1 | 2, excludeId?: string) =>
    players.filter(p => p.gender === genderFor(category, slot) && p.playerId !== excludeId);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await (window.api as any).tournamentTeamMatchesReassignPlayers(match.id, {
        team1Player1Id: t1p1,
        team1Player2Id: isDoubles ? (t1p2 || null) : null,
        team2Player1Id: t2p1,
        team2Player2Id: isDoubles ? (t2p2 || null) : null,
      });
      onSaved();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to reassign players');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-[420px] max-w-[90vw]" onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 24px 48px -12px rgba(0,0,0,0.2)', animation: 'ctxFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        <h3 className="text-lg font-bold text-zinc-900 mb-4">Edit Players — {match.category}{match.slotNumber}</h3>
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1">Team 1</label>
            <select value={t1p1} onChange={e => setT1p1(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl mb-2">
              {optionsFor(team1Players, match.category!, 1, isDoubles ? t1p2 : undefined).map(p => <option key={p.playerId} value={p.playerId}>{p.name}</option>)}
            </select>
            {isDoubles && (
              <select value={t1p2} onChange={e => setT1p2(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl">
                {optionsFor(team1Players, match.category!, 2, t1p1).map(p => <option key={p.playerId} value={p.playerId}>{p.name}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1">Team 2</label>
            <select value={t2p1} onChange={e => setT2p1(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl mb-2">
              {optionsFor(team2Players, match.category!, 1, isDoubles ? t2p2 : undefined).map(p => <option key={p.playerId} value={p.playerId}>{p.name}</option>)}
            </select>
            {isDoubles && (
              <select value={t2p2} onChange={e => setT2p2(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl">
                {optionsFor(team2Players, match.category!, 2, t2p1).map(p => <option key={p.playerId} value={p.playerId}>{p.name}</option>)}
              </select>
            )}
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

const regKeyFor = (p1: string, p2: string | null) => [p1, p2 ?? ''].sort().join('|');

function EditMatchupModal({ match, regs, roundMatches, onClose, onSaved }: {
  match: MatchRow;
  regs: RegRow[];
  roundMatches: MatchRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const regLabel = (r: RegRow) =>
    `${r.player1Name}${r.player2Name ? ` / ${r.player2Name}` : ''} (Lv${r.player1Level}${r.player2Level != null ? `+${r.player2Level}` : ''})`;

  // A round-robin round has no idle registrations — everyone is already seated in
  // some pending match. So the pickable set is "who's playing this round", and
  // saving trades places with whoever currently holds the chosen slot.
  const roundParticipants = useMemo(() => {
    const seatedKeys = new Set<string>();
    for (const m of roundMatches) {
      if (m.status !== 'pending') continue;
      seatedKeys.add(regKeyFor(m.team1Player1Id, m.team1Player2Id));
      seatedKeys.add(regKeyFor(m.team2Player1Id, m.team2Player2Id));
    }
    return regs.filter(r => seatedKeys.has(regKeyFor(r.player1Id, r.player2Id)));
  }, [regs, roundMatches]);

  const currentTeam1Reg = regs.find(r => regKeyFor(r.player1Id, r.player2Id) === regKeyFor(match.team1Player1Id, match.team1Player2Id));
  const currentTeam2Reg = regs.find(r => regKeyFor(r.player1Id, r.player2Id) === regKeyFor(match.team2Player1Id, match.team2Player2Id));

  const [team1RegId, setTeam1RegId] = useState(currentTeam1Reg?.id ?? '');
  const [team2RegId, setTeam2RegId] = useState(currentTeam2Reg?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const optionsFor = (otherSelection: string) => roundParticipants.filter(r => r.id !== otherSelection);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await (window.api as any).tournamentsReassignMatch(match.id, {
        team1RegistrationId: team1RegId,
        team2RegistrationId: team2RegId,
      });
      onSaved();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to reassign matchup');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-[420px] max-w-[90vw]" onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 24px 48px -12px rgba(0,0,0,0.2)', animation: 'ctxFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        <h3 className="text-lg font-bold text-zinc-900 mb-4">Edit Matchup — {match.round}</h3>
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1">Team 1</label>
            <select value={team1RegId} onChange={e => setTeam1RegId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl">
              {optionsFor(team2RegId).map(r => <option key={r.id} value={r.id}>{regLabel(r)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1">Team 2</label>
            <select value={team2RegId} onChange={e => setTeam2RegId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl">
              {optionsFor(team1RegId).map(r => <option key={r.id} value={r.id}>{regLabel(r)}</option>)}
            </select>
          </div>
        </div>
        {error && <p className="mb-3 text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 rounded-xl">Cancel</button>
          <button onClick={handleSave} disabled={saving || !team1RegId || !team2RegId}
            className="px-5 py-2 text-sm font-semibold bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 active:scale-[0.97] transition-all disabled:opacity-40">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function TournamentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<TourData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'registration' | 'teams' | 'bracket' | 'standings'>('overview');
  const [regs, setRegs] = useState<RegRow[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [teamStandings, setTeamStandings] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [showAddReg, setShowAddReg] = useState(false);
  const [regPlayer1, setRegPlayer1] = useState('');
  const [regPlayer2, setRegPlayer2] = useState('');
  const [regMode, setRegMode] = useState<'individual' | 'pair'>('individual');
  const [scoreMatch, setScoreMatch] = useState<MatchRow | null>(null);
  const [editPlayersMatch, setEditPlayersMatch] = useState<MatchRow | null>(null);
  const [editMatchupMatch, setEditMatchupMatch] = useState<MatchRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [regError, setRegError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'generate' | 'advance' | 'generateTeam' | null>(null);
  // Team tournament state
  const [teams, setTeams] = useState<any[]>([]);
  const [teamMatches, setTeamMatches] = useState<any[]>([]);
  const [teamPlayers, setTeamPlayers] = useState<Record<string, any[]>>({});
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [showGenerateTeam, setShowGenerateTeam] = useState(false);
  const [composition, setComposition] = useState({ ms: '2', ws: '2', md: '2', xd: '2', wd: '1' });
  const [teamError, setTeamError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [t, r, p, s, tms, ts, tmatches] = await Promise.all([
      window.api.tournamentsGet(id) as Promise<TourData>,
      window.api.tournamentsRegistrations(id) as Promise<RegRow[]>,
      window.api.playersList() as Promise<any[]>,
      window.api.tournamentsStandings(id) as Promise<StandingRow[]>,
      (window.api as any).tournamentTeamsList(id) as Promise<any[]>,
      (window.api as any).tournamentTeamsStandings(id) as Promise<any[]>,
      (window.api as any).tournamentTeamMatchesList(id) as Promise<any[]>,
    ]);
    setData(t); setRegs(r); setPlayers(p); setStandings(s);
    setTeams(tms); setTeamStandings(ts); setTeamMatches(tmatches);
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
      const ok = await confirm({
        title: 'Regenerate schedule?',
        message,
        confirmLabel: 'Regenerate',
        danger: true,
      });
      if (!ok) return;
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

  const loadTeamPlayers = useCallback(async (teamId: string) => {
    const ps = await (window.api as any).tournamentTeamsListPlayers(teamId) as any[];
    setTeamPlayers(prev => ({ ...prev, [teamId]: ps }));
  }, []);

  const handleAddTeam = async () => {
    if (!id || !newTeamName.trim()) return;
    setTeamError(null);
    try {
      await (window.api as any).tournamentTeamsCreate(id, newTeamName.trim());
      setNewTeamName(''); setShowAddTeam(false);
      await load();
    } catch (err: any) { setTeamError(err?.message ?? 'Failed to create team'); }
  };

  const handleDeleteTeam = async (teamId: string) => {
    const ok = await confirm({ title: 'Delete team?', message: 'This will remove all team members from this team.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    await (window.api as any).tournamentTeamsDelete(teamId);
    await load();
  };

  const handleAddPlayerToTeam = async (teamId: string, playerId: string) => {
    setTeamError(null);
    try {
      await (window.api as any).tournamentTeamsAddPlayer(teamId, playerId);
      await loadTeamPlayers(teamId);
      await load();
    } catch (err: any) { setTeamError(err?.message ?? 'Failed to add player'); }
  };

  const handleRemovePlayerFromTeam = async (teamId: string, playerId: string) => {
    await (window.api as any).tournamentTeamsRemovePlayer(teamId, playerId);
    await loadTeamPlayers(teamId);
    await load();
  };

  const handleGenerateTeamMatches = async () => {
    if (!id) return;
    setTeamError(null);
    const parsed = {
      ms: Math.max(0, parseInt(composition.ms) || 0),
      ws: Math.max(0, parseInt(composition.ws) || 0),
      md: Math.max(0, parseInt(composition.md) || 0),
      xd: Math.max(0, parseInt(composition.xd) || 0),
      wd: Math.max(0, parseInt(composition.wd) || 0),
    };
    setBusyAction('generateTeam');
    try {
      const result = await (window.api as any).tournamentTeamMatchesGenerate(id, parsed) as { warnings: string[] };
      await load();
      if (result.warnings.length > 0) {
        setTeamError(result.warnings.join(' | '));
      } else {
        setShowGenerateTeam(false);
        setTab('bracket');
      }
    } catch (err: any) { setTeamError(err?.message ?? 'Failed to generate matches'); }
    finally { setBusyAction(null); }
  };

  const handleExpandTeam = (teamId: string) => {
    if (expandedTeam === teamId) { setExpandedTeam(null); return; }
    setExpandedTeam(teamId);
    loadTeamPlayers(teamId);
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
  const isRegistered = regs.length >= 2 || teams.length >= 2;
  const nextAction = !isRegistered
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
    { label: 'Register', done: isRegistered },
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
          {(['overview', 'registration', 'teams', 'bracket', 'standings'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors capitalize ${tab === t ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600'}`}
            >{t}</button>
          ))}
        </div>

        {/* Overview */}
        {tab === 'overview' && (
          <div className="max-w-lg">
            {data.description && <p className="text-sm text-zinc-500 mb-4">{data.description}</p>}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-white border border-zinc-200/60 rounded-2xl p-5">
                <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider mb-1">Registrations</p>
                <p className="text-3xl font-bold text-zinc-900 tabular-nums font-mono">{data.registrationCount}</p>
              </div>
              <div className="bg-white border border-zinc-200/60 rounded-2xl p-5">
                <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider mb-1">Rounds</p>
                <p className="text-3xl font-bold text-zinc-900 tabular-nums font-mono">{data.rounds.length}</p>
              </div>
              {teams.length > 0 && (
                <div className="bg-white border border-zinc-200/60 rounded-2xl p-5">
                  <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider mb-1">Teams</p>
                  <p className="text-3xl font-bold text-zinc-900 tabular-nums font-mono">{teams.length}</p>
                </div>
              )}
            </div>
            <a href={`#/tournaments/${id}/live`}
              onClick={e => { e.preventDefault(); navigate(`/tournaments/${id}/live`); }}
              className="inline-flex items-center gap-2 h-9 px-4 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 active:scale-[0.97] transition-all shadow-sm">
              <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse" />
              Live Control →
            </a>
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

        {/* Teams */}
        {tab === 'teams' && (
          <div>
            {teamError && <p className="mb-4 text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{teamError}</p>}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-zinc-400">{teams.length} teams</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowGenerateTeam(true); setTeamError(null); }}
                  disabled={teams.length < 2 || busyAction === 'generateTeam'}
                  className="h-8 px-3 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 active:scale-[0.97] transition-all disabled:opacity-40 inline-flex items-center gap-1.5"
                >
                  {busyAction === 'generateTeam' ? 'Generating...' : 'Generate Matches'}
                </button>
                <button onClick={() => { setShowAddTeam(true); setTeamError(null); }} className="h-8 px-3 text-sm font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 active:scale-[0.97] transition-all inline-flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Add Team
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {teams.map((team: any) => {
                const tp = teamPlayers[team.id] ?? [];
                const isExpanded = expandedTeam === team.id;
                const teamPlayerIds = new Set(tp.map((p: any) => p.playerId));
                const availableToAdd = players.filter(p => !teamPlayerIds.has(p.id));
                return (
                  <div key={team.id} className="bg-white border border-zinc-200/60 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-50 transition-colors" onClick={() => handleExpandTeam(team.id)}>
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                      <span className="flex-1 text-sm font-bold text-zinc-900">{team.name}</span>
                      <span className="text-xs text-zinc-400 font-medium">{team.playerCount} players</span>
                      <button onClick={e => { e.stopPropagation(); handleDeleteTeam(team.id); }} className="text-zinc-300 hover:text-red-500 transition-colors ml-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                      <svg className={`w-4 h-4 text-zinc-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-zinc-100 px-4 py-3">
                        <div className="space-y-1.5 mb-3">
                          {tp.map((p: any, i: number) => (
                            <div key={p.playerId} className="flex items-center gap-2 py-1">
                              <span className="text-xs text-zinc-400 w-5 text-right font-mono">{i + 1}</span>
                              <span className="flex-1 text-sm font-medium text-zinc-800">{p.name}</span>
                              <span className="text-xs text-zinc-400">Lv{p.level} · {p.gender}</span>
                              {p.club && <span className="text-xs text-zinc-400">{p.club}</span>}
                              <button onClick={() => handleRemovePlayerFromTeam(team.id, p.playerId)} className="text-zinc-300 hover:text-red-500 transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                          ))}
                          {tp.length === 0 && <p className="text-xs text-zinc-400 italic">No players yet</p>}
                        </div>
                        {availableToAdd.length > 0 && (
                          <select
                            className="w-full px-3 py-1.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 text-zinc-600"
                            value=""
                            onChange={e => { if (e.target.value) handleAddPlayerToTeam(team.id, e.target.value); }}
                          >
                            <option value="">+ Add player to {team.name}</option>
                            {availableToAdd.map((p: any) => (
                              <option key={p.id} value={p.id}>{p.name} — Lv{p.level} · {p.gender}{p.club ? ` (${p.club})` : ''}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {teams.length === 0 && <p className="text-sm text-zinc-400">No teams yet. Add teams and assign players before generating matches.</p>}
            </div>

            {/* Add team modal */}
            {showAddTeam && (
              <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowAddTeam(false)}>
                <div className="bg-white rounded-2xl p-6 w-[360px]" onClick={e => e.stopPropagation()}
                  style={{ boxShadow: '0 24px 48px -12px rgba(0,0,0,0.2)', animation: 'ctxFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                  <h3 className="text-lg font-bold text-zinc-900 mb-4">Add Team</h3>
                  <input autoFocus value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddTeam(); if (e.key === 'Escape') setShowAddTeam(false); }}
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400 mb-4"
                    placeholder="Team / club name" />
                  {teamError && <p className="mb-3 text-xs text-red-600">{teamError}</p>}
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowAddTeam(false)} className="px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 rounded-xl">Cancel</button>
                    <button onClick={handleAddTeam} disabled={!newTeamName.trim()} className="px-5 py-2 text-sm font-semibold bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 disabled:opacity-40">Add</button>
                  </div>
                </div>
              </div>
            )}

            {/* Generate team matches modal */}
            {showGenerateTeam && (
              <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowGenerateTeam(false)}>
                <div className="bg-white rounded-2xl p-6 w-[380px]" onClick={e => e.stopPropagation()}
                  style={{ boxShadow: '0 24px 48px -12px rgba(0,0,0,0.2)', animation: 'ctxFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                  <h3 className="text-lg font-bold text-zinc-900 mb-1">Generate Team Matches</h3>
                  <p className="text-sm text-zinc-500 mb-4">{teams.length} teams · {teams.length * (teams.length - 1) / 2} team matches</p>
                  <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Rubber composition</label>
                  <div className="space-y-2 mb-4">
                    {([
                      ['ms', "Men's Singles"],
                      ['ws', "Women's Singles"],
                      ['md', "Men's Doubles"],
                      ['xd', 'Mixed Doubles'],
                      ['wd', "Women's Doubles"],
                    ] as const).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-zinc-600">{label}</span>
                        <input type="number" min="0" max="9" value={composition[key]}
                          onChange={e => setComposition({ ...composition, [key]: e.target.value })}
                          className="w-16 px-2 py-1 text-sm text-center border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400" />
                      </div>
                    ))}
                  </div>
                  {teamError && <p className="mb-3 text-xs text-red-600">{teamError}</p>}
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowGenerateTeam(false)} className="px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 rounded-xl">Cancel</button>
                    <button onClick={handleGenerateTeamMatches} disabled={busyAction === 'generateTeam'}
                      className="px-5 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-40">
                      {busyAction === 'generateTeam' ? 'Generating...' : 'Generate'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Team standings (if any completed) */}
            {teamStandings.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-bold text-zinc-700 mb-3">Team Standings</h3>
                <div className="bg-white border border-zinc-200/60 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-100">
                        <th className="text-left px-4 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Team</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">MP</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">W</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">L</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">GW</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">GL</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamStandings.map((s: any, i: number) => (
                        <tr key={s.teamId} className={i % 2 === 0 ? 'bg-white' : 'bg-zinc-50/50'}>
                          <td className="px-4 py-2 font-semibold text-zinc-800 flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                            {s.name}
                          </td>
                          <td className="text-center px-3 py-2 text-zinc-500 tabular-nums">{s.mp}</td>
                          <td className="text-center px-3 py-2 text-emerald-600 font-semibold tabular-nums">{s.w}</td>
                          <td className="text-center px-3 py-2 text-red-500 tabular-nums">{s.l}</td>
                          <td className="text-center px-3 py-2 text-zinc-500 tabular-nums">{s.gw}</td>
                          <td className="text-center px-3 py-2 text-zinc-500 tabular-nums">{s.gl}</td>
                          <td className="text-center px-3 py-2 font-bold text-zinc-900 tabular-nums">{s.pts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-zinc-400 uppercase">{bye ? 'Auto-advance' : `Court ${m.courtNumber ?? '—'}`}</span>
                            {m.category && (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">
                                {m.category}{m.slotNumber}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${m.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : m.status === 'in_progress' ? 'bg-amber-50 text-amber-700' : 'bg-zinc-100 text-zinc-500'}`}>{m.status}</span>
                            {!bye && m.category && m.status === 'pending' && (
                              <button onClick={() => setEditPlayersMatch(m)}
                                className="h-6 px-2 text-[11px] font-semibold text-zinc-700 border border-zinc-200 rounded-md hover:bg-zinc-50 active:scale-[0.97] transition-all">
                                Edit Players
                              </button>
                            )}
                            {!bye && !m.category && m.status === 'pending' && (
                              <button onClick={() => setEditMatchupMatch(m)}
                                className="h-6 px-2 text-[11px] font-semibold text-zinc-700 border border-zinc-200 rounded-md hover:bg-zinc-50 active:scale-[0.97] transition-all">
                                Edit Matchup
                              </button>
                            )}
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
                        {formatSetScores(m) && (
                          <p className="text-[11px] text-zinc-400 text-center mt-1 font-mono">{formatSetScores(m)}</p>
                        )}
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
      {editMatchupMatch && (
        <EditMatchupModal
          match={editMatchupMatch}
          regs={regs}
          roundMatches={matches.filter((m: MatchRow) => m.round === editMatchupMatch.round)}
          onClose={() => setEditMatchupMatch(null)}
          onSaved={() => { setEditMatchupMatch(null); load(); }}
        />
      )}
      {editPlayersMatch && (() => {
        const tm = teamMatches.find((t: any) => t.id === editPlayersMatch.teamMatchId);
        if (!tm) return null;
        return (
          <EditPlayersModal
            match={editPlayersMatch}
            team1Id={tm.team1Id}
            team2Id={tm.team2Id}
            onClose={() => setEditPlayersMatch(null)}
            onSaved={() => { setEditPlayersMatch(null); load(); }}
          />
        );
      })()}
    </div>
  );
}
