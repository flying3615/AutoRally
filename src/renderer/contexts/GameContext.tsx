import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import { GameTimer } from '../services/timer';

export type TimerState = { remaining: number; phase: 'running' | 'warning' | 'ended' | 'paused' };

interface GameContextValue {
  timers: Map<number, TimerState>;
  startGame: (courtNumber: number, durationMinutes: number, onEnded: () => void) => void;
  pauseGame: (courtNumber: number) => void;
  resumeGame: (courtNumber: number) => void;
  earlyFinishGame: (courtNumber: number) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [timers, setTimers] = useState<Map<number, TimerState>>(new Map());
  const timerRef = useRef<GameTimer>(new GameTimer()); // eagerly initialized — never null
  const onEndedRef = useRef<Map<number, () => void>>(new Map());

  useEffect(() => {
    return () => { timerRef.current.stopAll(); };
  }, []);

  const startGame = useCallback((courtNumber: number, durationMinutes: number, onEnded: () => void) => {
    onEndedRef.current.set(courtNumber, onEnded);

    timerRef.current.start(courtNumber, durationMinutes, (remaining, phase) => {
      setTimers(prev => {
        const next = new Map(prev);
        if (phase === 'ended') {
          next.delete(courtNumber); // clean up on natural end
        } else {
          next.set(courtNumber, { remaining, phase });
        }
        return next;
      });

      if (phase === 'ended') {
        onEndedRef.current.get(courtNumber)?.();
        onEndedRef.current.delete(courtNumber);
      }
    });
  }, []);

  const pauseGame = useCallback((courtNumber: number) => {
    timerRef.current.pause(courtNumber);
  }, []);

  const resumeGame = useCallback((courtNumber: number) => {
    timerRef.current.resume(courtNumber);
  }, []);

  const earlyFinishGame = useCallback((courtNumber: number) => {
    const cb = onEndedRef.current.get(courtNumber);
    timerRef.current.stop(courtNumber);
    onEndedRef.current.delete(courtNumber);
    setTimers(prev => {
      const next = new Map(prev);
      next.delete(courtNumber);
      return next;
    });
    cb?.();
  }, []);

  return (
    <GameContext.Provider value={{ timers, startGame, pauseGame, resumeGame, earlyFinishGame }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGameContext() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGameContext must be used within GameProvider');
  return ctx;
}
