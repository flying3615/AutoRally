import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the audio imports that timer.ts pulls in at the top level
vi.mock('../alarm/time-warning-bilibili.mp3', () => ({ default: '' }));
vi.mock('../alarm/time-up-lanhuacao.mp3', () => ({ default: '' }));

// Mock the Audio constructor so new Audio() doesn't blow up in Node
const mockPlay = vi.fn().mockResolvedValue(undefined);
class MockAudio {
  src: string;
  volume = 0.4;
  private listeners = new Map<string, Set<() => void>>();

  constructor(src: string) { this.src = src; }
  play = mockPlay;

  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}
vi.stubGlobal('Audio', MockAudio);

import { GameTimer } from '../renderer/services/timer';

describe('GameTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', MockAudio);
    mockPlay.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('clears warned on pause so warning bell re-fires after resume', () => {
    const timer = new GameTimer();

    // Spy on the private warningBell instance so we have a reliable handle
    const playSpy = vi.spyOn(
      (timer as unknown as { warningBell: { play: () => Promise<void> } }).warningBell,
      'play'
    ).mockResolvedValue(undefined);

    const phases: string[] = [];

    // Start a 2-minute timer (120 s)
    timer.start(1, 2, (_remaining, phase) => phases.push(phase));

    // Advance 61 s → ~59 s remaining → inside warning window (last 60 s)
    vi.advanceTimersByTime(61 * 1000);

    expect(phases).toContain('warning');
    expect(playSpy).toHaveBeenCalledTimes(1); // bell fired once

    // Pause while inside the warning window
    timer.pause(1);
    playSpy.mockClear();

    // Resume — warned was cleared on pause, so the bell should fire again
    timer.resume(1);
    vi.advanceTimersByTime(1000);

    expect(playSpy).toHaveBeenCalledTimes(1); // bell fires again after resume

    timer.stop(1);
  });

  it('plays alarms at max volume and restores the previous volume when the sound ends', () => {
    const timer = new GameTimer();
    const warningBell = (timer as unknown as { warningBell: MockAudio }).warningBell;
    warningBell.volume = 0.25;

    timer.start(1, 2, () => {});
    vi.advanceTimersByTime(61 * 1000);

    expect(mockPlay).toHaveBeenCalledTimes(1);
    expect(warningBell.volume).toBe(1);

    warningBell.dispatch('ended');

    expect(warningBell.volume).toBe(0.25);
    timer.stop(1);
  });
});
