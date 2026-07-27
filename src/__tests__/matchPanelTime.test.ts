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

    expect(getPlayingTimerRecovery(startedAt, 15 * 60, null, 0, now)).toEqual({ action: 'complete' });
  });

  it('restores orphan playing games when their stored duration has not elapsed', () => {
    const now = Date.parse('2026-05-19T05:30:00.000Z');
    const startedAt = '2026-05-19T05:20:30.000Z';

    expect(getPlayingTimerRecovery(startedAt, 15 * 60, null, 0, now)).toEqual({
      action: 'restore',
      remainingSeconds: 330,
      paused: false,
    });
  });

  it('ignores time spent paused before an app restart', () => {
    // Started at 05:14:00, paused after 5 real minutes (05:19:00) with 10 of 15
    // minutes remaining. Restart happens 40 minutes later — if pause time
    // counted as elapsed, the game would look long finished.
    const now = Date.parse('2026-05-19T06:00:00.000Z');
    const startedAt = '2026-05-19T05:14:00.000Z';
    const pausedAt = '2026-05-19T05:19:00.000Z';

    expect(getPlayingTimerRecovery(startedAt, 15 * 60, pausedAt, 0, now)).toEqual({
      action: 'restore',
      remainingSeconds: 600,
      paused: true,
    });
  });

  it('accounts for accumulated pause time from an earlier pause/resume cycle', () => {
    const now = Date.parse('2026-05-19T05:30:00.000Z');
    const startedAt = '2026-05-19T05:14:00.000Z';

    // 16 real minutes have passed since start, but 5 of them were a completed
    // pause (already folded into pausedSeconds), so only 11 minutes actually
    // ran against the 15-minute duration.
    expect(getPlayingTimerRecovery(startedAt, 15 * 60, null, 5 * 60, now)).toEqual({
      action: 'restore',
      remainingSeconds: 240,
      paused: false,
    });
  });

  it('clamps elapsed time to zero when pausedSeconds exceeds the wall-clock delta', () => {
    // Only 60 real seconds have passed since start, but pausedSeconds claims
    // an hour of pause time (e.g. clock skew or inconsistent legacy data).
    // Elapsed must clamp to 0, not go negative and hand back more than the
    // full duration.
    const now = Date.parse('2026-05-19T05:30:00.000Z');
    const startedAt = '2026-05-19T05:29:00.000Z';

    expect(getPlayingTimerRecovery(startedAt, 15 * 60, null, 3600, now)).toEqual({
      action: 'restore',
      remainingSeconds: 15 * 60,
      paused: false,
    });
  });
});
