import { describe, it, expect } from 'vitest';
import { generateMatches } from '../renderer/services/matching';
import type { Game } from '../shared/types';

interface PlayerInPool {
  id: string;
  name: string;
  gender: 'male' | 'female';
  level: number;
  checkinTime: string;
}

function makePlayer(id: string, name: string, gender: 'male' | 'female', level: number, minutesAgo = 0): PlayerInPool {
  return {
    id,
    name,
    gender,
    level,
    checkinTime: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  };
}

function makeGame(
  id: string, sessionId: string, court: number,
  t1p1: string, t1p2: string, t2p1: string, t2p2: string,
  round: number, gameType: string, status: 'pending' | 'playing' | 'completed' = 'completed',
): Game {
  return {
    id, sessionId, courtNumber: court,
    team1Player1Id: t1p1, team1Player2Id: t1p2,
    team2Player1Id: t2p1, team2Player2Id: t2p2,
    status, roundNumber: round, gameType: gameType as Game['gameType'],
    startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
  };
}

describe('generateMatches', () => {
  it('returns empty when fewer than 4 players', () => {
    const pool = [
      makePlayer('p1', 'A', 'male', 3),
      makePlayer('p2', 'B', 'male', 3),
      makePlayer('p3', 'C', 'male', 3),
    ];
    const result = generateMatches(pool, 3, 1, []);
    expect(result).toHaveLength(0);
  });

  it('generates one match for exactly 4 players', () => {
    const pool = [
      makePlayer('p1', 'A', 'male', 5),
      makePlayer('p2', 'B', 'male', 4),
      makePlayer('p3', 'C', 'male', 3),
      makePlayer('p4', 'D', 'male', 2),
    ];
    const result = generateMatches(pool, 3, 1, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.gameType).toBe('same-gender');
  });

  it('balances teams by level: strongest+weakest vs middle', () => {
    // Levels: 5, 4, 3, 2 → team1(5+2=7) vs team2(4+3=7)
    const pool = [
      makePlayer('p1', 'A', 'male', 5, 30),
      makePlayer('p2', 'B', 'male', 4, 25),
      makePlayer('p3', 'C', 'male', 3, 20),
      makePlayer('p4', 'D', 'male', 2, 15),
    ];
    const result = generateMatches(pool, 3, 1, []);
    expect(result).toHaveLength(1);
    const match = result[0]!;
    // team1 should have strongest + weakest
    const team1Ids = new Set([match.team1[0], match.team1[1]]);
    expect(team1Ids.has('p1')).toBe(true); // level 5
    expect(team1Ids.has('p4')).toBe(true); // level 2
  });

  it('respects court count limit', () => {
    const pool = Array.from({ length: 16 }, (_, i) =>
      makePlayer(`p${i + 1}`, `Player${i + 1}`, 'male', (i % 5) + 1, i * 5)
    );
    const result = generateMatches(pool, 2, 1, []);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('generates mixed doubles on even rounds', () => {
    const pool = [
      makePlayer('m1', 'Male1', 'male', 4, 30),
      makePlayer('m2', 'Male2', 'male', 3, 25),
      makePlayer('f1', 'Female1', 'female', 4, 20),
      makePlayer('f2', 'Female2', 'female', 3, 15),
    ];
    // Round 2 is even → mixed
    const result = generateMatches(pool, 3, 2, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.gameType).toBe('mixed');

    // Each team should have one male and one female
    const match = result[0]!;
    const team1HasMixed = pool.find(p => p.id === match.team1[0])!.gender !==
                          pool.find(p => p.id === match.team1[1])!.gender;
    expect(team1HasMixed).toBe(true);
  });

  it('generates same-gender on odd rounds', () => {
    const pool = [
      makePlayer('m1', 'Male1', 'male', 4, 30),
      makePlayer('m2', 'Male2', 'male', 3, 25),
      makePlayer('m3', 'Male3', 'male', 4, 20),
      makePlayer('m4', 'Male4', 'male', 3, 15),
    ];
    // Round 1 is odd → same-gender
    const result = generateMatches(pool, 3, 1, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.gameType).toBe('same-gender');
  });

  it('falls back to level-based matching when gender split is insufficient', () => {
    // 7 males, 1 female — can't do mixed doubles
    const pool = [
      makePlayer('m1', 'Male1', 'male', 4, 30),
      makePlayer('m2', 'Male2', 'male', 3, 25),
      makePlayer('m3', 'Male3', 'male', 4, 20),
      makePlayer('m4', 'Male4', 'male', 3, 15),
      makePlayer('m5', 'Male5', 'male', 2, 10),
      makePlayer('m6', 'Male6', 'male', 2, 5),
      makePlayer('m7', 'Male7', 'male', 5, 3),
      makePlayer('f1', 'Female1', 'female', 3, 1),
    ];
    // Round 2 (mixed) but not enough females → fallback
    const result = generateMatches(pool, 3, 2, []);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('prioritizes players who waited longer', () => {
    const pool = [
      makePlayer('p1', 'Early1', 'male', 3, 60), // waited 60min
      makePlayer('p2', 'Early2', 'male', 3, 55), // waited 55min
      makePlayer('p3', 'Early3', 'male', 3, 50),
      makePlayer('p4', 'Early4', 'male', 3, 45),
      makePlayer('p5', 'Late1', 'male', 5, 5),   // just arrived, level 5
      makePlayer('p6', 'Late2', 'male', 5, 3),   // just arrived, level 5
      makePlayer('p7', 'Late3', 'male', 5, 2),
      makePlayer('p8', 'Late4', 'male', 5, 1),
    ];
    const result = generateMatches(pool, 1, 1, []);
    expect(result).toHaveLength(1);
    const match = result[0]!;
    const allIds = [...match.team1, ...match.team2];
    // Early players should be prioritized (at least some of them)
    const earlyCount = allIds.filter(id => ['p1', 'p2', 'p3', 'p4'].includes(id)).length;
    expect(earlyCount).toBeGreaterThanOrEqual(2);
  });

  it('uses exactly 4 unique players per match', () => {
    const pool = Array.from({ length: 12 }, (_, i) =>
      makePlayer(`p${i + 1}`, `Player${i + 1}`, i % 2 === 0 ? 'male' as const : 'female' as const, (i % 5) + 1, i * 5)
    );
    const result = generateMatches(pool, 3, 1, []);
    for (const match of result) {
      const ids = [...match.team1, ...match.team2];
      expect(ids).toHaveLength(4);
      expect(new Set(ids).size).toBe(4);
    }
  });

  it('does not reuse players across matches', () => {
    const pool = Array.from({ length: 12 }, (_, i) =>
      makePlayer(`p${i + 1}`, `Player${i + 1}`, 'male', (i % 5) + 1, i * 5)
    );
    const result = generateMatches(pool, 3, 1, []);
    const allIds = result.flatMap(m => [...m.team1, ...m.team2]);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('handles large pool with many courts', () => {
    const pool = Array.from({ length: 24 }, (_, i) =>
      makePlayer(`p${i + 1}`, `Player${i + 1}`, i % 3 === 0 ? 'female' as const : 'male' as const, (i % 5) + 1, i * 3)
    );
    const result = generateMatches(pool, 6, 1, []);
    expect(result.length).toBeLessThanOrEqual(6);
    expect(result.length).toBeGreaterThanOrEqual(1);

    const allIds = result.flatMap(m => [...m.team1, ...m.team2]);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('works with past games history', () => {
    const pool = [
      makePlayer('p1', 'A', 'male', 4, 30),
      makePlayer('p2', 'B', 'male', 4, 25),
      makePlayer('p3', 'C', 'male', 4, 20),
      makePlayer('p4', 'D', 'male', 4, 15),
    ];
    // p1+p2 and p3+p4 were partners before
    const pastGames = [
      makeGame('g1', 's1', 1, 'p1', 'p2', 'p3', 'p4', 1, 'same-gender'),
    ];
    const result = generateMatches(pool, 1, 1, pastGames);
    expect(result).toHaveLength(1);
    // Should still produce valid teams even with history
    const match = result[0]!;
    expect([...match.team1, ...match.team2].sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});
