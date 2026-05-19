import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AttendanceInfo, GameInfo, PlayerInfo, Settings } from './types';

export function useMatchPanelData(sessionId: string | undefined) {
  const [games, setGames] = useState<GameInfo[]>([]);
  const [attendance, setAttendance] = useState<AttendanceInfo[]>([]);
  const [allPlayers, setAllPlayers] = useState<PlayerInfo[]>([]);
  const [settings, setSettings] = useState<Settings>({ gameDuration: '15', courtCount: '3' });

  const load = useCallback(async () => {
    if (!sessionId) return;
    const [gameList, attendList, playerList, allSettings] = await Promise.all([
      window.api.gamesListBySession(sessionId),
      window.api.attendanceListBySession(sessionId),
      window.api.playersList(),
      window.api.settingsGetAll(),
    ]);
    setGames(gameList as GameInfo[]);
    setAttendance(attendList as AttendanceInfo[]);
    setAllPlayers(playerList as PlayerInfo[]);
    setSettings(allSettings as Settings);
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const activeGames = useMemo(() => games.filter(g => g.status === 'playing'), [games]);
  const pendingGames = useMemo(() => games.filter(g => g.status === 'pending'), [games]);
  const pendingRoundKey = useMemo(() => pendingGames.map(g => g.id).sort().join('|'), [pendingGames]);
  const currentRound = useMemo(
    () => games.length > 0 ? Math.max(...games.map(g => g.roundNumber)) : 0,
    [games],
  );

  const playingIds = useMemo(
    () => new Set(activeGames.flatMap(g => [g.team1Player1Id, g.team1Player2Id, g.team2Player1Id, g.team2Player2Id])),
    [activeGames],
  );
  const pendingIds = useMemo(
    () => new Set(pendingGames.flatMap(g => [g.team1Player1Id, g.team1Player2Id, g.team2Player1Id, g.team2Player2Id])),
    [pendingGames],
  );
  const inGameIds = useMemo(() => new Set([...playingIds, ...pendingIds]), [playingIds, pendingIds]);

  const attendedIds = useMemo(() => new Set(attendance.map(a => a.playerId)), [attendance]);
  const pausedPlayerIds = useMemo(
    () => new Set(attendance.filter(a => a.paused === 1).map(a => a.playerId)),
    [attendance],
  );
  const checkedOutPlayerIds = useMemo(
    () => new Set([...inGameIds].filter(id => !attendedIds.has(id))),
    [attendedIds, inGameIds],
  );

  const waitingPlayers = useMemo(
    () => attendance.filter(a => !inGameIds.has(a.playerId) && a.paused !== 1),
    [attendance, inGameIds],
  );
  const pausedPlayers = useMemo(
    () => attendance.filter(a => a.paused === 1 && !inGameIds.has(a.playerId)),
    [attendance, inGameIds],
  );
  const maleWaiting = useMemo(() => waitingPlayers.filter(p => p.gender === 'male'), [waitingPlayers]);
  const femaleWaiting = useMemo(() => waitingPlayers.filter(p => p.gender === 'female'), [waitingPlayers]);

  return {
    games,
    attendance,
    allPlayers,
    settings,
    load,
    activeGames,
    pendingGames,
    pendingRoundKey,
    currentRound,
    playingIds,
    pendingIds,
    inGameIds,
    attendedIds,
    pausedPlayerIds,
    checkedOutPlayerIds,
    waitingPlayers,
    pausedPlayers,
    maleWaiting,
    femaleWaiting,
  };
}
