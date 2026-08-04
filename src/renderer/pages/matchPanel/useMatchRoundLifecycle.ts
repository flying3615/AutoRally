import { useCallback, useEffect, useRef } from 'react';
import type { TimerState } from '../../contexts/GameContext';
import { getPlayingTimerRecovery } from './time';
import { usePendingRoundCountdown } from './usePendingRoundCountdown';
import type { GenerateOptions } from './useMatchGeneration';
import type { AttendanceInfo, GameInfo } from './types';

interface UseMatchRoundLifecycleParams {
  attendance: AttendanceInfo[];
  activeGames: GameInfo[];
  pendingGames: GameInfo[];
  pendingRoundKey: string;
  gameDuration: string;
  timers: Map<number, TimerState>;
  startGame: (courtNumber: number, durationMinutes: number, onEnded: () => void) => void;
  pauseGame: (courtNumber: number) => void;
  resumeGame: (courtNumber: number) => void;
  earlyFinishGame: (courtNumber: number) => void;
  load: () => void | Promise<void>;
  generatePendingRound: (opts?: GenerateOptions) => Promise<boolean> | void;
}

export function useMatchRoundLifecycle({
  attendance,
  activeGames,
  pendingGames,
  pendingRoundKey,
  gameDuration,
  timers,
  startGame,
  pauseGame,
  resumeGame,
  earlyFinishGame,
  load,
  generatePendingRound,
}: UseMatchRoundLifecycleParams) {
  const generatingRef = useRef(false);
  const recoveringGameIdsRef = useRef<Set<string>>(new Set());

  // Pre-arrange the next round as soon as a round is live (kept populated all round).
  // Runs silently. Once a pending round exists it is left frozen; if there
  // aren't enough eligible players yet (generation returned false), the
  // attendance dependency re-runs this effect whenever the pool changes
  // (check-in, unpause, pause, checkout) so the NEXT UP round eventually
  // pre-schedules without requiring manual action.
  useEffect(() => {
    if (generatingRef.current) return;
    if (activeGames.length === 0) return;
    if (pendingGames.length > 0) return;
    generatingRef.current = true;
    Promise.resolve(generatePendingRound({ silent: true }))
      .finally(() => { generatingRef.current = false; });
  }, [attendance, activeGames.length, pendingGames.length, generatePendingRound]);

  useEffect(() => {
    const durationSeconds = (Number(gameDuration) || 0) * 60;
    if (activeGames.length === 0 || durationSeconds <= 0) return;

    for (const game of activeGames) {
      if (timers.has(game.courtNumber) || recoveringGameIdsRef.current.has(game.id)) continue;

      const recovery = getPlayingTimerRecovery(game.startedAt, durationSeconds, game.pausedAt, game.pausedSeconds ?? 0);
      if (!recovery) continue;

      recoveringGameIdsRef.current.add(game.id);
      if (recovery.action === 'complete') {
        window.api.gamesComplete(game.id)
          .then(() => load())
          .finally(() => recoveringGameIdsRef.current.delete(game.id));
      } else {
        startGame(game.courtNumber, recovery.remainingSeconds / 60, () => {
          window.api.gamesComplete(game.id).then(() => load());
        });
        // The game was still paused when the app closed — restore that state
        // rather than letting it run from the recovered remaining time.
        if (recovery.paused) pauseGame(game.courtNumber);
        window.setTimeout(() => recoveringGameIdsRef.current.delete(game.id), 0);
      }
    }
  }, [activeGames, timers, gameDuration, startGame, pauseGame, load]);

  const handleStartRound = useCallback(async () => {
    if (pendingGames.length === 0) return;
    const duration = Number(gameDuration);
    for (const game of pendingGames) {
      await window.api.gamesStart(game.id);
      startGame(game.courtNumber, duration, () => {
        window.api.gamesComplete(game.id).then(() => load());
      });
    }
    load();
  }, [pendingGames, gameDuration, startGame, load]);

  const pendingCountdown = usePendingRoundCountdown({
    enabled: activeGames.length === 0 && pendingGames.length > 0,
    pendingKey: pendingRoundKey,
    onElapsed: handleStartRound,
  });

  const pauseAll = useCallback(() => {
    for (const game of activeGames) {
      pauseGame(game.courtNumber);
      // Persist so a restart while paused doesn't count paused time as elapsed.
      window.api.gamesPause(game.id);
    }
  }, [activeGames, pauseGame]);

  const resumeAll = useCallback(() => {
    for (const game of activeGames) {
      const timer = timers.get(game.courtNumber);
      if (timer?.phase === 'paused') {
        resumeGame(game.courtNumber);
        window.api.gamesResume(game.id);
      }
    }
  }, [activeGames, resumeGame, timers]);

  const finishAll = useCallback(async () => {
    for (const game of activeGames) {
      earlyFinishGame(game.courtNumber);
      await window.api.gamesComplete(game.id);
    }
    load();
  }, [activeGames, earlyFinishGame, load]);

  const anyPaused = activeGames.some(g => timers.get(g.courtNumber)?.phase === 'paused');
  const masterTimer = activeGames.map(g => timers.get(g.courtNumber)).find(timer => timer !== undefined);
  const isWarning = activeGames.some(g => timers.get(g.courtNumber)?.phase === 'warning');

  return {
    anyPaused,
    finishAll,
    isWarning,
    masterTimer,
    pauseAll,
    pendingCountdown,
    resumeAll,
  };
}
