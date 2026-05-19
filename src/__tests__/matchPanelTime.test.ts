import { describe, expect, it } from 'vitest';
import { formatSecondsAsClock, getPlayingTimerRecovery, pendingCountdownLabel } from '../renderer/pages/matchPanel/time';

describe('match panel pending countdown labels', () => {
  it('formats pending countdown time consistently', () => {
    expect(formatSecondsAsClock(60)).toBe('1:00');
    expect(formatSecondsAsClock(9)).toBe('0:09');
    expect(formatSecondsAsClock(-4)).toBe('0:00');
  });

  it('shows active and paused pending countdown labels', () => {
    expect(pendingCountdownLabel(42, false)).toBe('Auto-start in 0:42');
    expect(pendingCountdownLabel(42, true)).toBe('Paused at 0:42');
  });

  it('completes orphan playing games once their stored duration has elapsed', () => {
    const now = Date.parse('2026-05-19T05:30:00.000Z');
    const startedAt = '2026-05-19T05:14:59.000Z';

    expect(getPlayingTimerRecovery(startedAt, 15 * 60, now)).toEqual({ action: 'complete' });
  });

  it('restores orphan playing games when their stored duration has not elapsed', () => {
    const now = Date.parse('2026-05-19T05:30:00.000Z');
    const startedAt = '2026-05-19T05:20:30.000Z';

    expect(getPlayingTimerRecovery(startedAt, 15 * 60, now)).toEqual({
      action: 'restore',
      remainingSeconds: 330,
    });
  });
});
