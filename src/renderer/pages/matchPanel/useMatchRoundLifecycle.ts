import { useCallback, useEffect, useRef } from 'react';
import type { TimerState } from '../../contexts/GameContext';
import { getPlayingTimerRecovery } from './time';
import { usePendingRoundCountdown } from './usePendingRoundCountdown';
import type { GameInfo } from './types';

interface UseMatchRoundLifecycleParams {
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
  generatePendingRound: () => void | Promise<void>;
}

export function useMatchRoundLifecycle({
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
  const nextRoundGeneratedRef = useRef(false);
  const recoveringGameIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (nextRoundGeneratedRef.current) return;
    if (activeGames.length === 0) return;
    if (pendingGames.length > 0) return;
    const hasWarning = activeGames.some(g => timers.get(g.courtNumber)?.phase === 'warning');
    if (hasWarning) {
      generatePendingRound();
      nextRoundGeneratedRef.current = true;
    }
  }, [timers, activeGames, pendingGames.length, generatePendingRound]);

  useEffect(() => {
    if (activeGames.length === 0) {
      nextRoundGeneratedRef.current = false;
    }
  }, [activeGames.length]);

  useEffect(() => {
    const durationSeconds = (Number(gameDuration) || 0) * 60;
    if (activeGames.length === 0 || durationSeconds <= 0) return;

    for (const game of activeGames) {
      if (timers.has(game.courtNumber) || recoveringGameIdsRef.current.has(game.id)) continue;

      const recovery = getPlayingTimerRecovery(game.startedAt, durationSeconds);
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
        window.setTimeout(() => recoveringGameIdsRef.current.delete(game.id), 0);
      }
    }
  }, [activeGames, timers, gameDuration, startGame, load]);

  const handleStartRound = useCallback(async () => {
    if (pendingGames.length === 0) return;
    nextRoundGeneratedRef.current = false;
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
    }
  }, [activeGames, pauseGame]);

  const resumeAll = useCallback(() => {
    for (const game of activeGames) {
      const timer = timers.get(game.courtNumber);
      if (timer?.phase === 'paused') resumeGame(game.courtNumber);
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
