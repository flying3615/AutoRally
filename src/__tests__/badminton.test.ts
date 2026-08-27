import { describe, expect, it } from 'vitest';
import { computeMatchOutcome, isValidBadmintonSetScore } from '../shared/badminton';

describe('isValidBadmintonSetScore', () => {
  it('accepts a normal set to 21', () => {
    expect(isValidBadmintonSetScore(21, 15)).toBe(true);
    expect(isValidBadmintonSetScore(21, 0)).toBe(true);
    expect(isValidBadmintonSetScore(19, 21)).toBe(true);
  });

  it('rejects 21 with too small a margin', () => {
    expect(isValidBadmintonSetScore(21, 20)).toBe(false);
    expect(isValidBadmintonSetScore(21, 21)).toBe(false);
  });

  it('requires a 2-point lead between 22 and 29', () => {
    expect(isValidBadmintonSetScore(22, 20)).toBe(true);
    expect(isValidBadmintonSetScore(29, 27)).toBe(true);
    expect(isValidBadmintonSetScore(23, 20)).toBe(false);
    expect(isValidBadmintonSetScore(24, 24)).toBe(false);
  });

  it('caps at 30, where 30-29 wins outright', () => {
    expect(isValidBadmintonSetScore(30, 29)).toBe(true);
    expect(isValidBadmintonSetScore(30, 28)).toBe(false);
    expect(isValidBadmintonSetScore(31, 29)).toBe(false);
  });

  it('rejects unfinished sets', () => {
    expect(isValidBadmintonSetScore(20, 18)).toBe(false);
    expect(isValidBadmintonSetScore(0, 0)).toBe(false);
  });

  it('rejects negative or non-integer scores', () => {
    expect(isValidBadmintonSetScore(-1, 21)).toBe(false);
    expect(isValidBadmintonSetScore(21.5, 15)).toBe(false);
  });
});

describe('computeMatchOutcome', () => {
  it('resolves a 2-0 sweep without a third set', () => {
    const result = computeMatchOutcome([
      { team1: 21, team2: 15 },
      { team1: 21, team2: 18 },
    ]);
    expect(result).toEqual({ team1Score: 2, team2Score: 0, winner: 'team1' });
  });

  it('resolves a split match decided by a third set', () => {
    const result = computeMatchOutcome([
      { team1: 21, team2: 15 },
      { team1: 18, team2: 21 },
      { team1: 21, team2: 17 },
    ]);
    expect(result).toEqual({ team1Score: 2, team2Score: 1, winner: 'team1' });
  });

  it('rejects a 1-1 split with no third set', () => {
    expect(() => computeMatchOutcome([
      { team1: 21, team2: 15 },
      { team1: 18, team2: 21 },
    ])).toThrow(/third set/i);
  });

  it('rejects a third set when the first two already decided the match', () => {
    expect(() => computeMatchOutcome([
      { team1: 21, team2: 15 },
      { team1: 21, team2: 18 },
      { team1: 15, team2: 21 },
    ])).toThrow(/already decided/i);
  });

  it('rejects an invalid individual set score', () => {
    expect(() => computeMatchOutcome([
      { team1: 21, team2: 20 },
      { team1: 21, team2: 18 },
    ])).toThrow(/invalid set score/i);
  });

  it('rejects the wrong number of sets', () => {
    expect(() => computeMatchOutcome([{ team1: 21, team2: 15 }])).toThrow(/2 or 3/);
    expect(() => computeMatchOutcome([
      { team1: 21, team2: 15 }, { team1: 21, team2: 15 }, { team1: 21, team2: 15 }, { team1: 21, team2: 15 },
    ])).toThrow(/2 or 3/);
  });
});
