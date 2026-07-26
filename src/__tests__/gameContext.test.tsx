import { expect, it, vi } from 'vitest';

const timer = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  stopAll: vi.fn(),
}));

vi.mock('react', () => ({
  createContext: () => ({ Provider: Symbol('GameContextProvider') }),
  useCallback: <T,>(callback: T) => callback,
  useContext: () => null,
  useEffect: () => undefined,
  useRef: <T,>(value: T) => ({ current: value }),
  useState: <T,>(value: T) => [value, vi.fn()],
}));

vi.mock('../renderer/services/timer', () => ({
  GameTimer: class {
    start = timer.start;
    stop = timer.stop;
    stopAll = timer.stopAll;
    pause = vi.fn();
    resume = vi.fn();
  },
}));

import { GameProvider } from '../renderer/contexts/GameContext';

it('stops an early-finished timer without invoking its completion callback', () => {
  const context = (GameProvider({ children: null }) as {
    props: {
      value: {
        startGame: (courtNumber: number, durationMinutes: number, onEnded: () => void) => void;
        earlyFinishGame: (courtNumber: number) => void;
      };
    };
  }).props.value;
  const onEnded = vi.fn();

  context.startGame(1, 15, onEnded);
  context.earlyFinishGame(1);

  expect(timer.stop).toHaveBeenCalledWith(1);
  expect(onEnded).not.toHaveBeenCalled();
});
