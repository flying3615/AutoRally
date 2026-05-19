import { describe, expect, it } from 'vitest';
import { averageSessionDurationMinutes, safeSessionEndTime, sessionDurationMinutes } from '../main/sessionDuration';

describe('session duration helpers', () => {
  it('returns null when a completed session has an end time before its start time', () => {
    expect(sessionDurationMinutes(
      '2026-05-19T06:00:00.000Z',
      '2026-05-19T05:29:00.000Z',
    )).toBeNull();
  });

  it('averages only valid positive session durations', () => {
    const avg = averageSessionDurationMinutes([
      { startTime: '2026-05-19T06:00:00.000Z', endTime: '2026-05-19T05:29:00.000Z' },
      { startTime: '2026-05-12T06:00:00.000Z', endTime: '2026-05-12T09:00:00.000Z' },
    ]);

    expect(avg).toBe(180);
  });

  it('does not allow a stored session end time before the session start time', () => {
    expect(safeSessionEndTime(
      '2026-05-19T06:00:00.000Z',
      '2026-05-19T05:29:00.000Z',
    )).toBe('2026-05-19T06:00:00.000Z');
  });
});
