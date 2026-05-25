import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import { levelColors, genderColors } from '../theme';
import { PlayerParticipationBar } from '../components/reportCharts/PlayerParticipationBar';
import { LevelDistributionBar } from '../components/reportCharts/LevelDistributionBar';
import { GameTypePie } from '../components/reportCharts/GameTypePie';
import { GamesPerRoundBar } from '../components/reportCharts/GamesPerRoundBar';
import { MatchTypePie } from '../components/reportCharts/MatchTypePie';

interface PlayerRow {
  playerId: string;
  name: string;
  gender: string;
  level: number;
  played: number;
  satOut: number;
  doubles: number;
  mixed: number;
  totalRounds: number;
  pct: number;
}

interface MatchRow {
  round: number;
  court: number;
  gameType: string;
  team1p1: string; team1p1Lv: number;
  team1p2: string; team1p2Lv: number;
  team2p1: string; team2p1Lv: number;
  team2p2: string; team2p2Lv: number;
  status: string;
}

export function Report() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [tab, setTab] = useState<'players' | 'matches'>('players');
  const [playerData, setPlayerData] = useState<{ maxRound: number; players: PlayerRow[] } | null>(null);
  const [matchRows, setMatchRows] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      const [raw, games] = await Promise.all([
        window.api.reportSessionStats(sessionId),
        window.api.gamesListBySession(sessionId) as Promise<any[]>,
      ]);
      setPlayerData({
        maxRound: raw.maxRound,
        players: raw.players.map(p => ({
          ...p,
          pct: raw.maxRound > 0 ? Math.round((p.played / raw.maxRound) * 100) : 0,
        })),
      });
      setMatchRows(games.map((g: any) => ({
        round: g.roundNumber,
        court: g.courtNumber,
        gameType: g.gameType,
        team1p1: g.t1p1Name,
        team1p1Lv: g.t1p1Level,
        team1p2: g.t1p2Name,
        team1p2Lv: g.t1p2Level,
        team2p1: g.t2p1Name,
        team2p1Lv: g.t2p1Level,
        team2p2: g.t2p2Name,
        team2p2Lv: g.t2p2Level,
        status: g.status,
      })));
      setLoading(false);
    })();
  }, [sessionId]);

  const playerColumns: any[] = useMemo(() => [
    {
      headerName: 'Player',
      field: 'name',
      pinned: 'left',
      flex: 2,
      minWidth: 160,
      cellRenderer: (params: any) => {
        const isMale = params.data.gender === 'male';
        return (
          <div className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
              style={{ backgroundColor: isMale ? genderColors.male.accent : genderColors.female.accent }}
            >
              {params.value?.[0] ?? ''}
            </span>
            <span className="font-bold text-zinc-800">{params.value}</span>
          </div>
        );
      },
    },
    {
      headerName: 'Lv',
      field: 'level',
      flex: 0.5,
      minWidth: 40,
      cellRenderer: (params: any) => (
        <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ color: (levelColors as any)[params.value] }}>
          {params.value}
        </span>
      ),
    },
    { headerName: 'Played', field: 'played', flex: 1, minWidth: 65 },
    { headerName: 'Sat Out', field: 'satOut', flex: 1, minWidth: 65 },
    { headerName: 'Doubles', field: 'doubles', flex: 1, minWidth: 70 },
    { headerName: 'Mixed', field: 'mixed', flex: 1, minWidth: 65 },
    {
      headerName: '%',
      field: 'pct',
      flex: 1,
      minWidth: 85,
      cellRenderer: (params: any) => {
        const v = params.value as number;
        const barColor = v >= 80 ? '#059669' : v >= 50 ? '#d97706' : '#dc2626';
        return (
          <div className="flex items-center gap-2 w-full">
            <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${v}%`, backgroundColor: barColor }} />
            </div>
            <span className="text-xs tabular-nums font-mono w-8 text-right">{v}%</span>
          </div>
        );
      },
    },
  ], []);

  const matchColumns: any[] = useMemo(() => [
    { headerName: 'Round', field: 'round', width: 70, sortable: true },
    { headerName: 'Court', field: 'court', width: 70, sortable: true },
    {
      headerName: 'Type',
      field: 'gameType',
      width: 120,
      cellRenderer: (params: any) => {
        const t = params.value as string;
        const color = t === 'mixed' ? '#7c3aed' : t === 'male-double' ? '#2563eb' : t === 'female-double' ? '#db2777' : '#78716c';
        return (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ color, backgroundColor: `${color}12` }}>{t}</span>
        );
      },
    },
    {
      headerName: 'Team 1',
      children: [
        { headerName: 'Player', field: 'team1p1', flex: 1, minWidth: 100 },
        { headerName: 'Lv', field: 'team1p1Lv', width: 40 },
        { headerName: 'Player', field: 'team1p2', flex: 1, minWidth: 100 },
        { headerName: 'Lv', field: 'team1p2Lv', width: 40 },
      ],
    },
    {
      headerName: 'Team 2',
      children: [
        { headerName: 'Player', field: 'team2p1', flex: 1, minWidth: 100 },
        { headerName: 'Lv', field: 'team2p1Lv', width: 40 },
        { headerName: 'Player', field: 'team2p2', flex: 1, minWidth: 100 },
        { headerName: 'Lv', field: 'team2p2Lv', width: 40 },
      ],
    },
    {
      headerName: 'Status',
      field: 'status',
      width: 100,
      cellRenderer: (params: any) => {
        const s = params.value as string;
        if (s === 'completed') return <span className="text-xs font-medium text-emerald-600">Completed</span>;
        if (s === 'playing') return <span className="text-xs font-medium text-amber-600">Playing</span>;
        return <span className="text-xs font-medium text-zinc-400">Pending</span>;
      },
    },
  ], []);

  const players = playerData?.players ?? [];

  const participationData = useMemo(() =>
    [...players].sort((a, b) => b.pct - a.pct).map(p => ({ name: p.name, mixed: p.mixed, doubles: p.doubles, satOut: p.satOut, pct: p.pct })),
  [players]);

  const playerGameTypeMix = useMemo(() => [
    { name: 'Doubles', value: players.reduce((s, p) => s + p.doubles, 0), color: '#059669' },
    { name: 'Mixed',   value: players.reduce((s, p) => s + p.mixed, 0),   color: '#7c3aed' },
  ].filter(d => d.value > 0), [players]);

  const levelDistData = useMemo(() =>
    [1, 2, 3, 4, 5].map(lv => ({ level: lv, count: players.filter(p => p.level === lv).length, color: levelColors[lv] ?? '#a1a1aa' })),
  [players]);

  const gamesPerRound = useMemo(() => {
    const map = new Map<number, number>();
    matchRows.forEach(m => map.set(m.round, (map.get(m.round) ?? 0) + 1));
    return Array.from(map.entries()).sort(([a], [b]) => a - b).map(([r, c]) => ({ round: `R${r}`, count: c }));
  }, [matchRows]);

  const matchTypeCounts = useMemo(() => {
    const map: Record<string, number> = {};
    matchRows.forEach(m => { map[m.gameType] = (map[m.gameType] ?? 0) + 1; });
    const colors: Record<string, string> = { mixed: '#7c3aed', 'male-double': '#2563eb', 'female-double': '#db2777', 'open-double': '#78716c' };
    return Object.entries(map).map(([name, value]) => ({ name, value, color: colors[name] ?? '#a1a1aa' })).filter(d => d.value > 0);
  }, [matchRows]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-48 h-4 skeleton" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-[90%] mx-auto px-8 py-10" style={{ animation: 'fadeIn 0.3s ease' }}>
        {/* Tab bar */}
        <div className="flex items-center gap-1 mb-6">
          <button
            onClick={() => setTab('players')}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${tab === 'players' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600'}`}
          >
            Players
          </button>
          <button
            onClick={() => setTab('matches')}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${tab === 'matches' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600'}`}
          >
            Matches
          </button>
          {tab === 'players' && (
            <div className="ml-auto flex items-center gap-4 text-xs text-zinc-400">
              <span>Total played: <strong className="text-zinc-700">{playerData?.players.reduce((s, p) => s + p.played, 0) ?? 0}</strong></span>
              <span>Avg: <strong className="text-zinc-700">{playerData ? Math.round(playerData.players.reduce((s, p) => s + p.pct, 0) / playerData.players.length) : 0}%</strong></span>
            </div>
          )}
          {tab === 'matches' && (
            <span className="ml-auto text-xs text-zinc-400">{matchRows.length} games</span>
          )}
        </div>

        {/* Player stats table */}
        {tab === 'players' && (
          <>
            {players.length > 0 && (
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="col-span-3 bg-white border border-zinc-200/60 rounded-2xl p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-4">Participation</p>
                  <PlayerParticipationBar data={participationData} />
                </div>
                <div className="col-span-2 bg-white border border-zinc-200/60 rounded-2xl p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-4">Level Distribution</p>
                  <LevelDistributionBar data={levelDistData} />
                </div>
                <div className="bg-white border border-zinc-200/60 rounded-2xl p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-4">Game Type Mix</p>
                  <GameTypePie data={playerGameTypeMix} />
                </div>
              </div>
            )}
            <div className="ag-theme-quartz" style={{ width: '100%' }}>
              <AgGridReact
                rowData={playerData?.players ?? []}
                columnDefs={playerColumns}
                defaultColDef={{ sortable: true, resizable: true }}
                domLayout="autoHeight"
                suppressRowHoverHighlight={false}
                rowHeight={36}
                headerHeight={38}
              />
            </div>
          </>
        )}

        {/* Match history table */}
        {tab === 'matches' && (
          <>
            {matchRows.length > 0 && (
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="col-span-2 bg-white border border-zinc-200/60 rounded-2xl p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-4">Games per Round</p>
                  <GamesPerRoundBar data={gamesPerRound} />
                </div>
                <div className="bg-white border border-zinc-200/60 rounded-2xl p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-4">By Type</p>
                  <MatchTypePie data={matchTypeCounts} />
                </div>
              </div>
            )}
            <div className="ag-theme-quartz" style={{ width: '100%' }}>
              <AgGridReact
                rowData={matchRows}
                columnDefs={matchColumns}
                defaultColDef={{ sortable: true, resizable: true }}
                domLayout="autoHeight"
                suppressRowHoverHighlight={false}
                rowHeight={36}
                headerHeight={60}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
