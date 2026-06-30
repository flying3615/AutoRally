import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { courtPhase } from '../theme';

interface TeamMatch {
  id: string;
  round: number;
  team1Id: string; team1Name: string; team1Color: string;
  team2Id: string; team2Name: string; team2Color: string;
  team1Wins: number; team2Wins: number;
  gamesPerMatch: number;
  status: string;
  completedGames: number; totalGames: number;
}

interface Game {
  id: string;
  teamMatchId: string;
  matchNumber: number;
  courtNumber: number | null;
  status: string;
  team1Player1Id: string; team1Player1Name: string; team1Player1Level: number;
  team2Player1Id: string; team2Player1Name: string; team2Player1Level: number;
  team1Score: number | null; team2Score: number | null;
  winner: string | null;
}

interface CourtSlot {
  courtNumber: number;
  game: Game | null;
  teamMatch: TeamMatch | null;
}

function ScoreModal({ game, teamMatch, onClose, onSaved }: {
  game: Game; teamMatch: TeamMatch | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [sc1, setSc1] = useState(game.team1Score != null ? String(game.team1Score) : '');
  const [sc2, setSc2] = useState(game.team2Score != null ? String(game.team2Score) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const s1 = parseInt(sc1); const s2 = parseInt(sc2);
    if (isNaN(s1) || isNaN(s2) || s1 < 0 || s2 < 0) { setError('Enter valid scores'); return; }
    if (s1 === s2) { setError('Scores cannot be equal'); return; }
    setSaving(true); setError(null);
    try {
      await (window.api as any).tournamentTeamMatchesSetScore(game.id, s1, s2);
      onSaved();
    } catch (err: any) { setError(err?.message ?? 'Failed'); }
    finally { setSaving(false); }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter') handleSave(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [sc1, sc2]);

  const team1Label = teamMatch ? teamMatch.team1Name : 'Team 1';
  const team2Label = teamMatch ? teamMatch.team2Name : 'Team 2';

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-[380px]" onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 24px 48px -12px rgba(0,0,0,0.25)', animation: 'ctxFadeIn 0.2s cubic-bezier(0.16,1,0.3,1)' }}>
        <h3 className="text-lg font-bold text-zinc-900 mb-1">Record Score</h3>
        <p className="text-xs text-zinc-400 mb-5">
          {team1Label} vs {team2Label} · Game {game.matchNumber}
          {teamMatch && <span className="ml-2">({teamMatch.team1Wins}-{teamMatch.team2Wins} in match)</span>}
        </p>
        <div className="grid grid-cols-3 gap-3 items-center mb-5">
          <div className="text-center">
            <p className="text-xs font-semibold text-zinc-500 mb-1 truncate">{game.team1Player1Name}</p>
            <input autoFocus type="number" min="0" value={sc1} onChange={e => setSc1(e.target.value)}
              className="w-full text-center text-2xl font-bold px-3 py-2 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400" />
          </div>
          <div className="text-center text-sm font-bold text-zinc-400">vs</div>
          <div className="text-center">
            <p className="text-xs font-semibold text-zinc-500 mb-1 truncate">{game.team2Player1Name}</p>
            <input type="number" min="0" value={sc2} onChange={e => setSc2(e.target.value)}
              className="w-full text-center text-2xl font-bold px-3 py-2 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400" />
          </div>
        </div>
        {error && <p className="mb-3 text-xs text-red-600 font-medium">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 rounded-xl">Cancel</button>
          <button onClick={handleSave} disabled={saving || !sc1 || !sc2}
            className="px-5 py-2 text-sm font-semibold bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 disabled:opacity-40 active:scale-[0.97] transition-all">
            {saving ? 'Saving…' : 'Save Score'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignModal({ pending, onAssign, onClose }: {
  pending: Array<{ game: Game; teamMatch: TeamMatch | null }>;
  onAssign: (gameId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-[440px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 24px 48px -12px rgba(0,0,0,0.25)', animation: 'ctxFadeIn 0.2s cubic-bezier(0.16,1,0.3,1)' }}>
        <h3 className="text-lg font-bold text-zinc-900 mb-4">Select Next Game</h3>
        <div className="flex-1 overflow-y-auto space-y-2">
          {pending.map(({ game, teamMatch }) => (
            <button key={game.id} onClick={() => onAssign(game.id)}
              className="w-full text-left bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 hover:border-zinc-300 rounded-xl px-4 py-3 transition-all active:scale-[0.98]">
              <div className="flex items-center gap-2 mb-1">
                {teamMatch && (
                  <>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: teamMatch.team1Color }} />
                    <span className="text-xs font-bold text-zinc-700">{teamMatch.team1Name}</span>
                    <span className="text-xs text-zinc-400">vs</span>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: teamMatch.team2Color }} />
                    <span className="text-xs font-bold text-zinc-700">{teamMatch.team2Name}</span>
                    <span className="ml-auto text-xs text-zinc-400">Game {game.matchNumber}</span>
                  </>
                )}
              </div>
              <p className="text-sm font-semibold text-zinc-800">
                {game.team1Player1Name} <span className="font-normal text-zinc-400">vs</span> {game.team2Player1Name}
              </p>
            </button>
          ))}
          {pending.length === 0 && <p className="text-sm text-zinc-400 py-4 text-center">No pending games</p>}
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 rounded-xl">Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function TournamentLivePanel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tournamentName, setTournamentName] = useState('');
  const [courtCount, setCourtCount] = useState(3);
  const [teamMatches, setTeamMatches] = useState<TeamMatch[]>([]);
  const [allGames, setAllGames] = useState<Game[]>([]);
  const [scoreGame, setScoreGame] = useState<Game | null>(null);
  const [assignCourt, setAssignCourt] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [tour, tms] = await Promise.all([
      window.api.tournamentsGet(id) as Promise<{ name: string; courtCount: number }>,
      (window.api as any).tournamentTeamMatchesList(id) as Promise<TeamMatch[]>,
    ]);
    setTournamentName(tour.name);
    setCourtCount(tour.courtCount);
    setTeamMatches(tms);

    // Load individual games for all team matches
    const gameResults = await Promise.all(
      tms.map((tm: TeamMatch) => (window.api as any).tournamentTeamMatchesListGames(tm.id) as Promise<Game[]>)
    );
    setAllGames(gameResults.flat());
  }, [id]);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  const findTeamMatch = (game: Game) => teamMatches.find(tm => tm.id === game.teamMatchId) ?? null;

  // Map courts to their active game
  const courts: CourtSlot[] = Array.from({ length: courtCount }, (_, i) => {
    const courtNumber = i + 1;
    const game = allGames.find(g => g.courtNumber === courtNumber && g.status === 'in_progress') ?? null;
    return { courtNumber, game, teamMatch: game ? findTeamMatch(game) : null };
  });

  const pendingGames = allGames.filter(g => g.status === 'pending');

  const handleAssign = async (gameId: string, courtNumber: number) => {
    await (window.api as any).tournamentTeamMatchesAssignCourt(gameId, courtNumber);
    setAssignCourt(null);
    await load();
  };

  const handleScoreSaved = async () => {
    setScoreGame(null);
    await load();
  };

  const pendingWithTeams = pendingGames.map(g => ({ game: g, teamMatch: findTeamMatch(g) }));

  return (
    <div className="h-full overflow-y-auto bg-zinc-50">
      <div className="px-8 py-6" style={{ animation: 'fadeIn 0.3s ease' }}>
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate(`/tournaments/${id}`)}
            className="h-8 px-3 text-sm font-medium text-zinc-600 hover:bg-white hover:border-zinc-200 border border-transparent rounded-lg transition-all inline-flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
            Back
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">{tournamentName}</h1>
            <p className="text-sm text-zinc-400">{pendingGames.length} games pending · {allGames.filter(g => g.status === 'completed').length} completed</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        </div>

        {/* Court grid */}
        <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: `repeat(${Math.min(courtCount, 4)}, 1fr)` }}>
          {courts.map(slot => (
            <CourtCard
              key={slot.courtNumber}
              slot={slot}
              hasPending={pendingGames.length > 0}
              onAssign={() => setAssignCourt(slot.courtNumber)}
              onScore={() => setScoreGame(slot.game)}
            />
          ))}
        </div>

        {/* Pending queue */}
        {pendingGames.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-zinc-700 mb-3">Queue ({pendingGames.length} games)</h2>
            <div className="grid gap-2 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {pendingWithTeams.map(({ game, teamMatch }) => (
                <div key={game.id} className="bg-white border border-zinc-200/60 rounded-xl px-4 py-3">
                  {teamMatch && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: teamMatch.team1Color }} />
                      <span className="text-xs font-semibold text-zinc-600">{teamMatch.team1Name}</span>
                      <span className="text-xs text-zinc-400 mx-0.5">vs</span>
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: teamMatch.team2Color }} />
                      <span className="text-xs font-semibold text-zinc-600">{teamMatch.team2Name}</span>
                      <span className="ml-auto text-xs text-zinc-400">Game {game.matchNumber}</span>
                    </div>
                  )}
                  <p className="text-sm font-medium text-zinc-700">
                    {game.team1Player1Name} <span className="text-zinc-400">vs</span> {game.team2Player1Name}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {allGames.length === 0 && (
          <div className="text-center py-20">
            <p className="text-zinc-400 text-sm">No games generated yet.</p>
            <p className="text-zinc-400 text-xs mt-1">Go to the Teams tab and generate matches first.</p>
          </div>
        )}
      </div>

      {scoreGame && (
        <ScoreModal
          game={scoreGame}
          teamMatch={findTeamMatch(scoreGame)}
          onClose={() => setScoreGame(null)}
          onSaved={handleScoreSaved}
        />
      )}

      {assignCourt !== null && (
        <AssignModal
          pending={pendingWithTeams}
          onAssign={(gameId) => handleAssign(gameId, assignCourt)}
          onClose={() => setAssignCourt(null)}
        />
      )}
    </div>
  );
}

function CourtCard({ slot, hasPending, onAssign, onScore }: {
  slot: CourtSlot;
  hasPending: boolean;
  onAssign: () => void;
  onScore: () => void;
}) {
  const { game, teamMatch, courtNumber } = slot;
  const isActive = game !== null;

  const cardStyle = isActive
    ? { backgroundColor: courtPhase.running.surface, borderColor: courtPhase.running.border, boxShadow: courtPhase.running.cardShadow }
    : { backgroundColor: '#fff', borderColor: 'rgba(228,228,231,0.7)', boxShadow: '0 2px 12px -4px rgba(0,0,0,0.04)' };

  return (
    <div className="rounded-2xl border p-5 min-h-[180px] flex flex-col" style={cardStyle}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold tabular-nums" style={{ color: isActive ? courtPhase.running.text : '#a1a1aa' }}>
          Court {courtNumber}
        </span>
        {isActive && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Playing</span>
        )}
      </div>

      {isActive && game ? (
        <>
          {teamMatch && (
            <div className="flex items-center gap-1.5 mb-3">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: teamMatch.team1Color }} />
              <span className="text-xs font-semibold text-zinc-600 truncate">{teamMatch.team1Name}</span>
              <span className="text-xs text-zinc-400 mx-0.5">vs</span>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: teamMatch.team2Color }} />
              <span className="text-xs font-semibold text-zinc-600 truncate">{teamMatch.team2Name}</span>
              <span className="ml-auto text-xs text-zinc-400 shrink-0">{teamMatch.team1Wins}-{teamMatch.team2Wins}</span>
            </div>
          )}
          <div className="flex-1 flex flex-col justify-center gap-2">
            <div className="text-center">
              <p className="text-lg font-bold text-zinc-900 truncate">{game.team1Player1Name}</p>
              <p className="text-xs text-zinc-400 mt-0.5">Lv{game.team1Player1Level}</p>
            </div>
            <div className="text-center text-sm font-bold text-zinc-400">vs</div>
            <div className="text-center">
              <p className="text-lg font-bold text-zinc-900 truncate">{game.team2Player1Name}</p>
              <p className="text-xs text-zinc-400 mt-0.5">Lv{game.team2Player1Level}</p>
            </div>
          </div>
          <button onClick={onScore}
            className="mt-4 w-full h-9 text-sm font-semibold bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 active:scale-[0.97] transition-all">
            Record Score
          </button>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <p className="text-sm text-zinc-400">Idle</p>
          {hasPending && (
            <button onClick={onAssign}
              className="h-8 px-4 text-sm font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 rounded-xl active:scale-[0.97] transition-all">
              Assign Next →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
