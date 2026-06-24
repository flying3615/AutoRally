import { useCallback } from 'react';
import { generateMatches } from '../../services/matching';
import { toast } from '../../stores/toastStore';
import type { AttendanceInfo, GameInfo, Settings } from './types';

interface UseMatchGenerationParams {
  sessionId: string | undefined;
  settings: Settings;
  attendance: AttendanceInfo[];
  playingIds: Set<string>;
  activeGames: GameInfo[];
  load: () => void | Promise<void>;
}

export function useMatchGeneration({
  sessionId,
  settings,
  attendance,
  playingIds,
  activeGames,
  load,
}: UseMatchGenerationParams) {
  return useCallback(async () => {
    if (!sessionId) return;

    try {
      const freshGames = await window.api.gamesListBySession(sessionId) as GameInfo[];
      for (const game of freshGames) {
        if (game.status === 'pending') {
          await window.api.gamesDelete(game.id);
        }
      }

      const maxRound = await window.api.gamesMaxRound(sessionId) as number;
      const nextRound = maxRound + 1;
      const courtCount = Number(settings.courtCount) || 3;
      const waitingAvailable = attendance.filter(a => !playingIds.has(a.playerId) && a.paused !== 1);

      let pool = waitingAvailable.map(a => ({
        id: a.playerId,
        name: a.name,
        gender: a.gender as 'male' | 'female',
        level: a.level,
        checkinTime: a.checkinTime,
      }));

      if (pool.length < courtCount * 4) {
        const activePlayerIds = new Set(activeGames.flatMap(g => [
          g.team1Player1Id,
          g.team1Player2Id,
          g.team2Player1Id,
          g.team2Player2Id,
        ]));
        const activeAvailable = attendance.filter(a => activePlayerIds.has(a.playerId) && a.paused !== 1);
        const extra = activeAvailable.map(a => ({
          id: a.playerId,
          name: a.name,
          gender: a.gender as 'male' | 'female',
          level: a.level,
          checkinTime: a.checkinTime,
        }));
        pool = [...pool, ...extra];
      }

      const countedGames = freshGames.filter(g => g.status !== 'pending');
      const matches = generateMatches(pool, courtCount, nextRound, countedGames);

      if (matches.length === 0) {
        toast.info(`Not enough players to generate matches (waiting pool has ${pool.length} players, need at least ${courtCount * 4})`);
        return;
      }

      for (let i = 0; i < matches.length; i++) {
        const match = matches[i]!;
        await window.api.gamesCreate({
          sessionId,
          courtNumber: i + 1,
          team1Player1Id: match.team1[0],
          team1Player2Id: match.team1[1],
          team2Player1Id: match.team2[0],
          team2Player2Id: match.team2[1],
          roundNumber: nextRound,
          gameType: match.gameType,
        });
      }
      load();
    } catch (err: unknown) {
      toast.error('Failed to generate matches: ' + (err instanceof Error ? err.message : String(err)));
    }
  }, [sessionId, settings, attendance, playingIds, activeGames, load]);
}
