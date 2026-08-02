import { describe, it, expect } from 'vitest';
import { generateMatches, type MatchResult } from '../renderer/services/matching';
import type { Game } from '../shared/types';
import fs from 'fs';
import path from 'path';

interface PlayerInPool {
  id: string;
  name: string;
  gender: 'male' | 'female';
  level: number;
  checkinTime: string;
}

const CHECKIN_REFERENCE = Date.parse('2026-01-01T12:00:00.000Z');

function makePlayer(id: string, name: string, gender: 'male' | 'female', level: number, minutesAgo = 0): PlayerInPool {
  return { id, name, gender, level, checkinTime: new Date(CHECKIN_REFERENCE - minutesAgo * 60_000).toISOString() };
}

function assertMatchesAreValid(pool: PlayerInPool[], matches: MatchResult[], courtCount: number): void {
  expect(matches.length).toBeLessThanOrEqual(courtCount);

  const playersById = new Map(pool.map(player => [player.id, player]));
  const allIds = matches.flatMap(match => [...match.team1, ...match.team2]);
  expect(new Set(allIds).size).toBe(allIds.length);
  expect(allIds.every(id => playersById.has(id))).toBe(true);

  const getPlayers = (ids: readonly string[]) => ids.map(id => playersById.get(id)!);
  for (const match of matches) {
    const ids = [...match.team1, ...match.team2];
    const players = getPlayers(ids);
    const maleCount = players.filter(player => player.gender === 'male').length;
    const femaleCount = players.length - maleCount;

    expect(ids).toHaveLength(4);
    switch (match.gameType) {
      case 'mixed':
        expect([maleCount, femaleCount]).toEqual([2, 2]);
        for (const team of [match.team1, match.team2]) {
          expect(getPlayers(team).map(player => player.gender).sort()).toEqual(['female', 'male']);
        }
        break;
      case 'male-double':
        expect(maleCount).toBe(4);
        break;
      case 'female-double':
        expect(femaleCount).toBe(4);
        break;
      case 'open-double':
        expect([maleCount, femaleCount].sort()).toEqual([1, 3]);
        break;
    }
  }
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

  it('requires at least 2M+2F within 1 level for mixed court', () => {
    const pool = [
      makePlayer('m1', 'M1', 'male', 3),
      makePlayer('m2', 'M2', 'male', 3),
      makePlayer('f1', 'F1', 'female', 3),
      makePlayer('f2', 'F2', 'female', 2),
    ];
    const result = generateMatches(pool, 3, 1, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.gameType).toBe('mixed');
    // Each team = 1M + 1F
    const match = result[0]!;
    const team1Genders = match.team1.map(id => pool.find(p => p.id === id)!.gender).sort();
    const team2Genders = match.team2.map(id => pool.find(p => p.id === id)!.gender).sort();
    expect(team1Genders).toEqual(['female', 'male']);
    expect(team2Genders).toEqual(['female', 'male']);
  });

  it('uses a wide-level match only as the fallback for an otherwise idle court', () => {
    const pool = [
      makePlayer('m1', 'M1', 'male', 5),
      makePlayer('m2', 'M2', 'male', 4),
      makePlayer('f1', 'F1', 'female', 3),
      makePlayer('f2', 'F2', 'female', 2),
    ];
    const result = generateMatches(pool, 3, 1, []);
    const allIds = result.flatMap(m => [...m.team1, ...m.team2]);
    const levels = allIds.map(id => pool.find(p => p.id === id)!.level);

    expect(result).toHaveLength(1);
    expect(Math.max(...levels) - Math.min(...levels)).toBeGreaterThan(1);
  });

  it('forms male-double when only same-level males available', () => {
    const pool = [
      makePlayer('m1', 'M1', 'male', 3),
      makePlayer('m2', 'M2', 'male', 3),
      makePlayer('m3', 'M3', 'male', 3),
      makePlayer('m4', 'M4', 'male', 3),
    ];
    const result = generateMatches(pool, 1, 1, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.gameType).toBe('male-double');
  });

  it('fills down one level when same-level is insufficient', () => {
    // 3M at level 4 + 1M at level 3 + 2F at level 3 = mixed court spanning 3-4
    const pool = [
      makePlayer('m1', 'M1', 'male', 4),
      makePlayer('m2', 'M2', 'male', 3),
      makePlayer('f1', 'F1', 'female', 3),
      makePlayer('f2', 'F2', 'female', 4),
    ];
    const result = generateMatches(pool, 1, 1, []);
    expect(result).toHaveLength(1);
  });

  it('balances mixed teams: one male + one female per team', () => {
    const pool = [
      makePlayer('m1', 'M1', 'male', 3, 30),
      makePlayer('m2', 'M2', 'male', 3, 25),
      makePlayer('f1', 'F1', 'female', 4, 20),
      makePlayer('f2', 'F2', 'female', 3, 15),
    ];
    const result = generateMatches(pool, 1, 1, []);
    expect(result).toHaveLength(1);
    // Game type must be mixed or open-double
    expect(['mixed', 'open-double']).toContain(result[0]!.gameType);
    const match = result[0]!;
    // Each team must have exactly 1 male + 1 female for mixed
    if (match.gameType === 'mixed') {
      for (const team of [match.team1, match.team2]) {
        const genders = team.map(id => pool.find(p => p.id === id)!.gender).sort();
        expect(genders).toEqual(['female', 'male']);
      }
    }
  });

  it('respects court count limit', () => {
    const pool = Array.from({ length: 24 }, (_, i) =>
      makePlayer(`p${i + 1}`, `P${i + 1}`, i % 2 === 0 ? 'male' : 'female', (i % 5) + 1, i * 5)
    );
    const result = generateMatches(pool, 2, 1, []);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('limits courts by available gender count', () => {
    // 6 males, 2 females → 1 mixed court (2M+2F) + 1 male-double court (4M) = 2 courts
    const pool = [
      ...Array.from({ length: 6 }, (_, i) => makePlayer(`m${i}`, `M${i}`, 'male', 3, i)),
      ...Array.from({ length: 2 }, (_, i) => makePlayer(`f${i}`, `F${i}`, 'female', 3, i)),
    ];
    const result = generateMatches(pool, 4, 1, []);
    expect(result.length).toBe(2);
    // First court should be mixed (uses the females), second male-double
    expect(result.some(m => m.gameType === 'mixed')).toBe(true);
    expect(result.some(m => m.gameType === 'male-double')).toBe(true);
  });

  it('does not reuse players across matches', () => {
    const pool = Array.from({ length: 16 }, (_, i) =>
      makePlayer(`p${i + 1}`, `P${i + 1}`, i % 2 === 0 ? 'male' : 'female', (i % 5) + 1, i * 5)
    );
    const result = generateMatches(pool, 4, 1, []);
    const allIds = result.flatMap(m => [...m.team1, ...m.team2]);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('fills all courts when 16 waiting players include a 3M+1F leftover court', () => {
    const pool = [
      ...Array.from({ length: 9 }, (_, i) => makePlayer(`m${i + 1}`, `M${i + 1}`, 'male', 3, i)),
      ...Array.from({ length: 7 }, (_, i) => makePlayer(`f${i + 1}`, `F${i + 1}`, 'female', 3, i + 9)),
    ];

    const result = generateMatches(pool, 4, 2, []);
    const allIds = result.flatMap(m => [...m.team1, ...m.team2]);

    expect(result).toHaveLength(4);
    expect(new Set(allIds).size).toBe(16);
  });

  it('finds a full-court global arrangement when greedy level seeding would under-fill', () => {
    const specs = [
      ['p0', 'male', 4], ['p1', 'male', 3], ['p2', 'male', 3], ['p3', 'female', 5],
      ['p4', 'male', 1], ['p5', 'female', 1], ['p6', 'female', 1], ['p7', 'female', 2],
      ['p8', 'female', 4], ['p9', 'male', 4], ['p10', 'female', 3], ['p11', 'female', 5],
      ['p12', 'male', 3], ['p13', 'female', 1], ['p14', 'male', 2], ['p15', 'female', 3],
    ] as const;
    const pool = specs.map(([id, gender, level], i) =>
      makePlayer(id, id, gender, level, i)
    );

    const result = generateMatches(pool, 4, 1, []);
    const allIds = result.flatMap(m => [...m.team1, ...m.team2]);

    expect(result).toHaveLength(4);
    expect(new Set(allIds).size).toBe(16);
    for (const match of result) {
      const levels = [...match.team1, ...match.team2].map(id => pool.find(p => p.id === id)!.level);
      expect(Math.max(...levels) - Math.min(...levels)).toBeLessThanOrEqual(1);
    }
  });

  it('does not keep a rare level group on court when same-level lower-count players can fill courts', () => {
    const pool = [
      ...Array.from({ length: 4 }, (_, i) => makePlayer(`l5_${i}`, `L5 ${i}`, i % 2 === 0 ? 'male' : 'female', 5, i)),
      ...Array.from({ length: 16 }, (_, i) => makePlayer(`l3_${i}`, `L3 ${i}`, i % 2 === 0 ? 'male' : 'female', 3, i + 4)),
    ];
    const pastGames: Game[] = [];
    for (let round = 1; round <= 3; round++) {
      pastGames.push({
        id: `past_${round}`,
        sessionId: 's',
        courtNumber: 1,
        team1Player1Id: 'l5_0',
        team1Player2Id: 'l5_1',
        team2Player1Id: 'l5_2',
        team2Player2Id: 'l5_3',
        status: 'completed',
        roundNumber: round,
        gameType: 'mixed',
        startedAt: null,
        endedAt: null,
      });
    }

    const result = generateMatches(pool, 4, 4, pastGames);
    const allIds = result.flatMap(m => [...m.team1, ...m.team2]);

    expect(result).toHaveLength(4);
    expect(allIds.some(id => id.startsWith('l5_'))).toBe(false);
  });

  it('uses a relaxed level fallback to fill an otherwise idle court', () => {
    const restingPlayers = [
      makePlayer('w1', 'W1', 'male', 1, 60),
      makePlayer('w2', 'W2', 'male', 1, 59),
      makePlayer('w3', 'W3', 'male', 1, 58),
      makePlayer('w4', 'W4', 'male', 4, 57),
    ];
    const activePlayers = Array.from({ length: 12 }, (_, i) =>
      makePlayer(`a${i + 1}`, `A${i + 1}`, 'male', 5, i)
    );
    const pastGames: Game[] = Array.from({ length: 3 }, (_, courtIndex) => ({
      id: `active_${courtIndex + 1}`,
      sessionId: 's',
      courtNumber: courtIndex + 1,
      team1Player1Id: `a${courtIndex * 4 + 1}`,
      team1Player2Id: `a${courtIndex * 4 + 2}`,
      team2Player1Id: `a${courtIndex * 4 + 3}`,
      team2Player2Id: `a${courtIndex * 4 + 4}`,
      status: 'playing',
      roundNumber: 1,
      gameType: 'male-double',
      startedAt: null,
      endedAt: null,
    }));
    const pool = [...restingPlayers, ...activePlayers];

    const result = generateMatches(pool, 4, 2, pastGames);
    const allIds = result.flatMap(m => [...m.team1, ...m.team2]);

    expect(result).toHaveLength(4);
    expect(new Set(allIds).size).toBe(16);
    for (const player of restingPlayers) expect(allIds).toContain(player.id);
  });

  it('fills courts from a single-gender waiting pool', () => {
    const pool = Array.from({ length: 16 }, (_, i) =>
      makePlayer(`m${i + 1}`, `M${i + 1}`, 'male', 3, i)
    );

    const result = generateMatches(pool, 4, 2, []);
    const allIds = result.flatMap(m => [...m.team1, ...m.team2]);

    expect(result).toHaveLength(4);
    expect(result.every(m => m.gameType === 'male-double')).toBe(true);
    expect(new Set(allIds).size).toBe(16);
  });

  it('uses open-double for asymmetric gender courts instead of mixed', () => {
    const pool = [
      makePlayer('m1', 'M1', 'male', 3),
      makePlayer('m2', 'M2', 'male', 3),
      makePlayer('m3', 'M3', 'male', 3),
      makePlayer('f1', 'F1', 'female', 3),
    ];

    const result = generateMatches(pool, 1, 1, []);

    expect(result).toHaveLength(1);
    expect(result[0]!.gameType).toBe('open-double');
  });

  it('forms a female-double for surplus same-level women that mixed cannot absorb', () => {
    // 6 women + 2 men, 2 courts. Mixed can only use the 2 men (one mixed court);
    // the 4 remaining women should form a women's double rather than two lopsided
    // open courts.
    const pool = [
      ...Array.from({ length: 6 }, (_, i) => makePlayer(`f${i + 1}`, `F${i + 1}`, 'female', 3, i)),
      makePlayer('m1', 'M1', 'male', 3, 6),
      makePlayer('m2', 'M2', 'male', 3, 7),
    ];

    const result = generateMatches(pool, 2, 1, []);

    expect(result).toHaveLength(2);
    expect(result.some(m => m.gameType === 'mixed')).toBe(true);
    expect(result.some(m => m.gameType === 'female-double')).toBe(true);
    // The women's double must be four women.
    const fd = result.find(m => m.gameType === 'female-double')!;
    for (const id of [...fd.team1, ...fd.team2]) {
      expect(pool.find(p => p.id === id)!.gender).toBe('female');
    }
  });

  it('keeps mixed as the default in a gender-balanced same-level pool (no segregation)', () => {
    // 4 women + 4 men, 2 courts. Mixed can absorb everyone, so the result should be
    // two mixed courts — not a women's double + men's double.
    const pool = [
      ...Array.from({ length: 4 }, (_, i) => makePlayer(`f${i + 1}`, `F${i + 1}`, 'female', 3, i)),
      ...Array.from({ length: 4 }, (_, i) => makePlayer(`m${i + 1}`, `M${i + 1}`, 'male', 3, i + 4)),
    ];

    const result = generateMatches(pool, 2, 1, []);

    expect(result).toHaveLength(2);
    expect(result.every(m => m.gameType === 'mixed')).toBe(true);
  });

  it('forms a female-double only for the waiting women, without hurting play-count fairness', () => {
    // 6 women + 2 men. Two women have already played a game; the four fresh women
    // (fewest games) must be the ones seated in the women's double, and the two
    // played women rest — play counts stay within one game of each other.
    const pool = [
      ...Array.from({ length: 6 }, (_, i) => makePlayer(`f${i + 1}`, `F${i + 1}`, 'female', 3, i)),
      makePlayer('m1', 'M1', 'male', 3, 6),
      makePlayer('m2', 'M2', 'male', 3, 7),
    ];
    // f1 & f2 already played one game together with the two men.
    const pastGames: Game[] = [{
      id: 'g1', sessionId: 's', courtNumber: 1,
      team1Player1Id: 'f1', team1Player2Id: 'm1',
      team2Player1Id: 'f2', team2Player2Id: 'm2',
      status: 'completed', roundNumber: 1, gameType: 'mixed',
      startedAt: null, endedAt: null,
    }];

    const result = generateMatches(pool, 1, 2, pastGames);

    expect(result).toHaveLength(1);
    expect(result[0]!.gameType).toBe('female-double');
    const seated = [...result[0]!.team1, ...result[0]!.team2];
    // The four fresh women (f3..f6) are the fair choice; f1/f2 already played.
    expect(seated.sort()).toEqual(['f3', 'f4', 'f5', 'f6']);
  });

  it('does not count pending games as played history when selecting players', () => {
    // All have game count 0 because pending games are excluded.  The algorithm
    // selects 4 of the 5 eligible players.  Which four is non-deterministic due
    // to per-candidate shuffling; we just verify a full court is produced.
    const pool = [
      makePlayer('p1', 'P1', 'male', 3, 10),
      makePlayer('p2', 'P2', 'male', 3, 9),
      makePlayer('p3', 'P3', 'male', 3, 8),
      makePlayer('p4', 'P4', 'male', 3, 7),
      makePlayer('p5', 'P5', 'male', 3, 6),
    ];
    const pendingGame = {
      id: 'pending',
      sessionId: 's',
      courtNumber: 1,
      team1Player1Id: 'p1',
      team1Player2Id: 'p2',
      team2Player1Id: 'p3',
      team2Player2Id: 'p4',
      status: 'pending',
      roundNumber: 1,
      gameType: 'male-double',
      startedAt: null,
      endedAt: null,
    } satisfies Game;

    const result = generateMatches(pool, 1, 2, [pendingGame]);
    expect(result).toHaveLength(1);
    const allIds = result.flatMap(m => [...m.team1, ...m.team2]);
    // 4 unique players, all from pool
    expect(new Set(allIds).size).toBe(4);
    for (const id of allIds) expect(pool.some(p => p.id === id)).toBe(true);
  });

  it('rotates prior partners before preserving team balance', () => {
    const pool = [
      { ...makePlayer('m1', 'M1', 'male', 4), checkinTime: '2026-01-01T00:00:00.000Z' },
      { ...makePlayer('m2', 'M2', 'male', 3), checkinTime: '2026-01-01T00:01:00.000Z' },
      { ...makePlayer('f1', 'F1', 'female', 4), checkinTime: '2026-01-01T00:02:00.000Z' },
      { ...makePlayer('f2', 'F2', 'female', 3), checkinTime: '2026-01-01T00:03:00.000Z' },
    ];
    const priorGame: Game = {
      id: 'round-1',
      sessionId: 's',
      courtNumber: 1,
      team1Player1Id: 'm1',
      team1Player2Id: 'f2',
      team2Player1Id: 'm2',
      team2Player2Id: 'f1',
      status: 'completed',
      roundNumber: 1,
      gameType: 'mixed',
      startedAt: null,
      endedAt: null,
    };

    const result = generateMatches(pool, 1, 2, [priorGame]);
    expect(result).toHaveLength(1);
    const teams = [result[0]!.team1, result[0]!.team2]
      .map(team => [...team].sort().join('|'))
      .sort();
    expect(teams).not.toContain('f2|m1');
    expect(teams).not.toContain('f1|m2');
  });

  it('avoids prior court groups and rotates relationships when equal alternatives exist', () => {
    const pool = Array.from({ length: 8 }, (_, index) => ({
      ...makePlayer(`m${index + 1}`, `M${index + 1}`, 'male', 3),
      checkinTime: '2026-01-01T00:00:00.000Z',
    }));
    const pastGames: Game[] = [
      {
        id: 'r1c1', sessionId: 's', courtNumber: 1,
        team1Player1Id: 'm1', team1Player2Id: 'm2',
        team2Player1Id: 'm3', team2Player2Id: 'm4',
        status: 'completed', roundNumber: 28, gameType: 'male-double',
        startedAt: null, endedAt: null,
      },
      {
        id: 'r1c2', sessionId: 's', courtNumber: 2,
        team1Player1Id: 'm5', team1Player2Id: 'm6',
        team2Player1Id: 'm7', team2Player2Id: 'm8',
        status: 'completed', roundNumber: 28, gameType: 'male-double',
        startedAt: null, endedAt: null,
      },
    ];

    const courtKey = (ids: string[]) => [...ids].sort().join('|');
    const pairKey = (first: string, second: string) => courtKey([first, second]);
    const partnerPairs = (games: Array<Pick<Game,
      'team1Player1Id' | 'team1Player2Id' | 'team2Player1Id' | 'team2Player2Id'
    >>) => new Set(games.flatMap(game => [
      pairKey(game.team1Player1Id, game.team1Player2Id),
      pairKey(game.team2Player1Id, game.team2Player2Id),
    ]));
    const opponentPairs = (games: Array<Pick<Game,
      'team1Player1Id' | 'team1Player2Id' | 'team2Player1Id' | 'team2Player2Id'
    >>) => new Set(games.flatMap(game => [
      pairKey(game.team1Player1Id, game.team2Player1Id),
      pairKey(game.team1Player1Id, game.team2Player2Id),
      pairKey(game.team1Player2Id, game.team2Player1Id),
      pairKey(game.team1Player2Id, game.team2Player2Id),
    ]));

    // Fixed check-in times and round number make this rotation scenario deterministic.
    const result = generateMatches(pool, 2, 29, pastGames);
    const previousCourts = new Set(pastGames.map(game => courtKey([
      game.team1Player1Id,
      game.team1Player2Id,
      game.team2Player1Id,
      game.team2Player2Id,
    ])));

    expect(result).toHaveLength(2);
    expect(result.every(game =>
      !previousCourts.has(courtKey([...game.team1, ...game.team2])),
    )).toBe(true);

    const generatedGames = result.map((game, index) => ({
      id: `r2c${index + 1}`, sessionId: 's', courtNumber: index + 1,
      team1Player1Id: game.team1[0]!, team1Player2Id: game.team1[1]!,
      team2Player1Id: game.team2[0]!, team2Player2Id: game.team2[1]!,
    }));
    const previousPartnerPairs = partnerPairs(pastGames);
    const previousOpponentPairs = opponentPairs(pastGames);
    const repeatedPartnerPairs = [...partnerPairs(generatedGames)]
      .filter(pair => previousPartnerPairs.has(pair)).length;
    const repeatedOpponentPairs = [...opponentPairs(generatedGames)]
      .filter(pair => previousOpponentPairs.has(pair)).length;

    expect(repeatedPartnerPairs).toBe(0);
    expect(repeatedOpponentPairs).toBe(0);
  });

  it('produces valid game types with no >1 level gap in any match', () => {
    const pool = Array.from({ length: 32 }, (_, i) =>
      makePlayer(`p${i + 1}`, `P${i + 1}`, i % 2 === 0 ? 'male' : 'female', (i % 5) + 1, i * 3)
    );
    const result = generateMatches(pool, 4, 1, []);
    for (const match of result) {
      expect(['mixed', 'male-double', 'female-double', 'open-double']).toContain(match.gameType);
      // Level spread must be ≤ 1
      const levels = [...match.team1, ...match.team2].map(id => pool.find(p => p.id === id)!.level);
      expect(Math.max(...levels) - Math.min(...levels)).toBeLessThanOrEqual(1);
      if (match.gameType === 'mixed') {
        // Each team: 1M + 1F
        for (const team of [match.team1, match.team2]) {
          const genders = team.map(id => pool.find(p => p.id === id)!.gender);
          expect(genders).toContain('male');
          expect(genders).toContain('female');
        }
      } else if (match.gameType === 'male-double') {
        for (const team of [match.team1, match.team2]) {
          const genders = team.map(id => pool.find(p => p.id === id)!.gender);
          expect(genders.every(g => g === 'male')).toBe(true);
        }
      } else if (match.gameType === 'female-double') {
        for (const team of [match.team1, match.team2]) {
          const genders = team.map(id => pool.find(p => p.id === id)!.gender);
          expect(genders.every(g => g === 'female')).toBe(true);
        }
      }
    }
  });

  it('keeps a full valid schedule above the per-level candidate cap', () => {
    const pool = Array.from({ length: 40 }, (_, index) =>
      makePlayer(`p${index + 1}`, `P${index + 1}`, index % 2 === 0 ? 'male' : 'female', 3, index),
    );

    const matches = generateMatches(pool, 4, 1, []);

    expect(matches).toHaveLength(4);
    assertMatchesAreValid(pool, matches, 4);
  });

  it('counts playing games when selecting the lowest-play-count players', () => {
    const pool = Array.from({ length: 8 }, (_, index) =>
      makePlayer(`p${index + 1}`, `P${index + 1}`, 'male', 3, index),
    );
    const playingGame = {
      id: 'playing-r1-c1', sessionId: 's', courtNumber: 1,
      team1Player1Id: 'p1', team1Player2Id: 'p2',
      team2Player1Id: 'p3', team2Player2Id: 'p4',
      status: 'playing', roundNumber: 1, gameType: 'male-double',
      startedAt: null, endedAt: null,
    } satisfies Game;

    const matches = generateMatches(pool, 1, 2, [playingGame]);
    const selectedIds = matches.flatMap(match => [...match.team1, ...match.team2]).sort();

    assertMatchesAreValid(pool, matches, 1);
    expect(selectedIds).toEqual(['p5', 'p6', 'p7', 'p8']);
  });

  it('seats a zero-game late arrival when a court has capacity', () => {
    const pool = [
      ...Array.from({ length: 7 }, (_, index) =>
        makePlayer(`p${index + 1}`, `P${index + 1}`, 'male', 3, index + 1),
      ),
      makePlayer('newcomer', 'Newcomer', 'male', 3, 0),
    ];
    const completedGames = [1, 2].map(round => ({
      id: `completed-r${round}`, sessionId: 's', courtNumber: 1,
      team1Player1Id: 'p1', team1Player2Id: 'p2',
      team2Player1Id: 'p3', team2Player2Id: 'p4',
      status: 'completed' as const, roundNumber: round, gameType: 'male-double' as const,
      startedAt: null, endedAt: null,
    }));

    const matches = generateMatches(pool, 1, 3, completedGames);
    const selectedIds = matches.flatMap(match => [...match.team1, ...match.team2]);

    assertMatchesAreValid(pool, matches, 1);
    expect(selectedIds).toContain('newcomer');
  });

  it.each([
    {
      name: 'one all-female level-one court',
      courtCount: 1,
      pool: Array.from({ length: 4 }, (_, index) =>
        makePlayer(`f${index + 1}`, `F${index + 1}`, 'female', 1, index),
      ),
    },
    {
      name: 'a gender-imbalanced pool that cannot fill every requested court',
      courtCount: 2,
      pool: [
        ...Array.from({ length: 6 }, (_, index) =>
          makePlayer(`m${index + 1}`, `M${index + 1}`, 'male', 2, index),
        ),
        makePlayer('f1', 'F1', 'female', 2, 6),
      ],
    },
    {
      name: 'three courts across levels one through five',
      courtCount: 3,
      pool: Array.from({ length: 13 }, (_, index) =>
        makePlayer(
          `p${index + 1}`,
          `P${index + 1}`,
          index % 3 === 0 ? 'female' : 'male',
          (index % 5) + 1,
          index,
        ),
      ),
    },
    {
      name: 'four courts with more than 36 players',
      courtCount: 4,
      pool: Array.from({ length: 37 }, (_, index) =>
        makePlayer(
          `p${index + 1}`,
          `P${index + 1}`,
          index % 2 === 0 ? 'male' : 'female',
          (index % 5) + 1,
          index,
        ),
      ),
    },
  ])('maintains scheduling invariants for $name', ({ pool, courtCount }) => {
    const matches = generateMatches(pool, courtCount, 7, []);

    assertMatchesAreValid(pool, matches, courtCount);
  });

  it('does not rest a level-isolated player two rounds in a row', () => {
    // 9 players, 2 courts → 1 rests each round. One lone Lv1 player can only be
    // seated via a wide-level-gap court. Cumulative fairness alone would bench
    // them every round; the consecutive-rest guarantee must force them back in.
    const players: PlayerInPool[] = [
      makePlayer('lone', 'Lone', 'male', 1, 100),
      ...Array.from({ length: 4 }, (_, i) => makePlayer(`hi${i}`, `Hi${i}`, i % 2 === 0 ? 'male' : 'female', 4, i + 1)),
      ...Array.from({ length: 4 }, (_, i) => makePlayer(`hj${i}`, `Hj${i}`, i % 2 === 0 ? 'male' : 'female', 5, i + 5)),
    ];

    const pastGames: Game[] = [];
    const restStreak = new Map<string, number>();
    const maxRestStreak = new Map<string, number>();
    players.forEach(p => { restStreak.set(p.id, 0); maxRestStreak.set(p.id, 0); });

    for (let round = 1; round <= 8; round++) {
      const matches = generateMatches(players, 2, round, pastGames);
      const playedThisRound = new Set<string>();
      for (const m of matches) {
        for (const id of [...m.team1, ...m.team2]) playedThisRound.add(id);
        pastGames.push({
          id: `g_r${round}_c${matches.indexOf(m) + 1}`, sessionId: 'sim',
          courtNumber: matches.indexOf(m) + 1,
          team1Player1Id: m.team1[0], team1Player2Id: m.team1[1],
          team2Player1Id: m.team2[0], team2Player2Id: m.team2[1],
          status: 'completed', roundNumber: round, gameType: m.gameType,
          startedAt: null, endedAt: null,
        });
      }
      for (const p of players) {
        if (playedThisRound.has(p.id)) {
          restStreak.set(p.id, 0);
        } else {
          const next = (restStreak.get(p.id) ?? 0) + 1;
          restStreak.set(p.id, next);
          if (next > (maxRestStreak.get(p.id) ?? 0)) maxRestStreak.set(p.id, next);
        }
      }
    }

    // No player — including the isolated Lv1 — sits two rounds running.
    expect(Math.max(...maxRestStreak.values())).toBeLessThanOrEqual(1);
    expect(maxRestStreak.get('lone')).toBeLessThanOrEqual(1);
  });

  it('groups same-level players together: one game per level group', () => {
    const pool = [
      makePlayer('m1', 'Low1', 'male', 2, 60),
      makePlayer('m2', 'Low2', 'male', 2, 55),
      makePlayer('m3', 'High1', 'male', 5, 5),
      makePlayer('m4', 'High2', 'male', 5, 3),
      makePlayer('f1', 'Low3', 'female', 2, 50),
      makePlayer('f2', 'Low4', 'female', 2, 45),
      makePlayer('f3', 'High3', 'female', 5, 2),
      makePlayer('f4', 'High4', 'female', 5, 1),
    ];
    const result = generateMatches(pool, 1, 1, []);
    expect(result).toHaveLength(1);
    const match = result[0]!;
    const allIds = [...match.team1, ...match.team2];
    // 4 unique players, all from pool
    expect(new Set(allIds).size).toBe(4);
    for (const id of allIds) {
      expect(pool.some(p => p.id === id)).toBe(true);
    }
    // Level spread must be ≤ 1
    const levels = allIds.map(id => pool.find(p => p.id === id)!.level);
    expect(Math.max(...levels) - Math.min(...levels)).toBeLessThanOrEqual(1);
  });
});

// ── Simulation helper ──

interface SimPlayer {
  id: string; name: string; gender: 'male' | 'female'; level: number;
}

function runSim(
  label: string,
  fileName: string,
  playerCount: number,
  courtCount: number,
  rounds: number,
): { spread: number; courtTypes: Set<string>; maxConsecutiveRest: number; consecutiveRestSpread: number } {
  const allNames = [
    'Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Hank',
    'Iris', 'Jack', 'Kate', 'Leo', 'Mia', 'Noah', 'Olivia', 'Paul',
    'Quinn', 'Ryan', 'Sara', 'Tom', 'Uma', 'Victor', 'Wendy', 'Xavier',
    'Yara', 'Zack', 'Anna', 'Ben', 'Chloe', 'Dan',
  ];

  const players: SimPlayer[] = allNames.slice(0, playerCount).map((name, i) => ({
    id: `P${i + 1}`,
    name,
    gender: (i % 2 === 0 ? 'female' : 'male') as 'male' | 'female',
    level: 3,  // single level — fairness is the only variable under test
  }));

  const gameCount = new Map<string, number>();
  players.forEach(p => gameCount.set(p.id, 0));

  // Consecutive-rest tracking: current streak + worst streak ever seen per player.
  const restStreak = new Map<string, number>();
  const maxRestStreak = new Map<string, number>();
  players.forEach(p => { restStreak.set(p.id, 0); maxRestStreak.set(p.id, 0); });

  const rows: string[] = ['Round,Court,GameType,Team1P1,Team1P2,Team2P1,Team2P2'];
  const pastGames: Game[] = [];
  const allCourtTypes = new Set<string>();

  for (let round = 1; round <= rounds; round++) {
    const checkinBase = Date.now();
    const pool: PlayerInPool[] = players.map((p, i) => ({
      id: p.id, name: p.name, gender: p.gender, level: p.level,
      checkinTime: new Date(checkinBase - (i * 60_000)).toISOString(),
    }));

    const matches = generateMatches(pool, courtCount, round, pastGames);

    const playedThisRound = new Set<string>();
    for (const m of matches) {
      allCourtTypes.add(m.gameType);
      const court = matches.indexOf(m) + 1;
      rows.push(`${round},${court},${m.gameType},${m.team1[0]}(${getLevel(m.team1[0], players)}),${m.team1[1]}(${getLevel(m.team1[1], players)}),${m.team2[0]}(${getLevel(m.team2[0], players)}),${m.team2[1]}(${getLevel(m.team2[1], players)})`);
      for (const id of [...m.team1, ...m.team2]) {
        gameCount.set(id, (gameCount.get(id) ?? 0) + 1);
        playedThisRound.add(id);
      }
      pastGames.push({
        id: `g_r${round}_c${court}`, sessionId: 'sim', courtNumber: court,
        team1Player1Id: m.team1[0], team1Player2Id: m.team1[1],
        team2Player1Id: m.team2[0], team2Player2Id: m.team2[1],
        status: 'completed', roundNumber: round, gameType: m.gameType,
        startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      });
    }

    // Update rest streaks: reset for players who played, increment for resters.
    for (const p of players) {
      if (playedThisRound.has(p.id)) {
        restStreak.set(p.id, 0);
      } else {
        const next = (restStreak.get(p.id) ?? 0) + 1;
        restStreak.set(p.id, next);
        if (next > (maxRestStreak.get(p.id) ?? 0)) maxRestStreak.set(p.id, next);
      }
    }
  }

  const maxConsecutiveRest = Math.max(...maxRestStreak.values());
  const consecutiveRestSpread = maxConsecutiveRest - Math.min(...maxRestStreak.values());

  rows.push('');
  rows.push('Player,Gender,Level,Games Played,Max Consecutive Rest');
  players.forEach(p => {
    rows.push(`${p.name},${p.gender},${p.level},${gameCount.get(p.id) ?? 0},${maxRestStreak.get(p.id) ?? 0}`);
  });

  const counts = Array.from(gameCount.values());
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const spread = max - min;
  rows.push('');
  rows.push(`Total players,${playerCount}`);
  rows.push(`Courts,${courtCount}`);
  rows.push(`Rounds,${rounds}`);
  rows.push(`Min games,${min}`);
  rows.push(`Max games,${max}`);
  rows.push(`Spread,${spread}`);
  rows.push(`Max consecutive rest,${maxConsecutiveRest}`);

  const csv = rows.join('\n');
  if (process.env.WRITE_SIM_CSV) {
    const outPath = path.join(__dirname, '..', '..', 'test-results', fileName);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, csv);
    console.log(`\n[${label}] CSV → ${outPath} | spread=${spread} | maxConsecRest=${maxConsecutiveRest} | types=[${[...allCourtTypes].join(',')}]`);
    console.log(csv);
  }

  // Play counts must stay within one game of each other across the session.
  expect(spread).toBeLessThanOrEqual(1);
  return { spread, courtTypes: allCourtTypes, maxConsecutiveRest, consecutiveRestSpread };
}

function getLevel(id: string, players: SimPlayer[]): number {
  return players.find(p => p.id === id)?.level ?? 0;
}

// ═══════════════════════════════════════════
// Simulation tests
// ═══════════════════════════════════════════

describe('4-court 10-round simulations', () => {
  it('12 players: not enough to fill 4 courts', () => {
    const { spread, maxConsecutiveRest } = runSim('under-filled', 'sim-12p-4c.csv', 12, 4, 10);
    expect(spread).toBeLessThanOrEqual(2); // 12p/4c is under-filled; perfect balance not guaranteed
    expect(maxConsecutiveRest).toBeLessThanOrEqual(1);
  }, 30000);

  it('16 players: exactly fills 4 courts (no rotation buffer)', () => {
    const { spread, maxConsecutiveRest } = runSim('exact-fit', 'sim-16p-4c.csv', 16, 4, 10);
    expect(spread).toBeLessThanOrEqual(1);
    expect(maxConsecutiveRest).toBeLessThanOrEqual(1);
  }, 30000);

  it('18 players: small rotation buffer (2 rest each round)', () => {
    const { spread, maxConsecutiveRest } = runSim('small-buffer', 'sim-18p-4c.csv', 18, 4, 10);
    expect(spread).toBeLessThanOrEqual(1);
    expect(maxConsecutiveRest).toBeLessThanOrEqual(1);
  }, 30000);

  it('20 players: slightly more than 4 courts (baseline)', () => {
    const { spread, maxConsecutiveRest } = runSim('baseline', 'sim-20p-4c.csv', 20, 4, 10);
    expect(spread).toBeLessThanOrEqual(1);
    expect(maxConsecutiveRest).toBeLessThanOrEqual(1);
  }, 30000);

  it('24 players: well above 4 courts', () => {
    const { spread, maxConsecutiveRest } = runSim('over-filled', 'sim-24p-4c.csv', 24, 4, 10);
    expect(spread).toBeLessThanOrEqual(1);
    expect(maxConsecutiveRest).toBeLessThanOrEqual(1);
  }, 30000);

  it('28 players: large rotation buffer still within consecutive-rest bound', () => {
    const { spread, maxConsecutiveRest } = runSim('large-buffer', 'sim-28p-4c.csv', 28, 4, 12);
    expect(spread).toBeLessThanOrEqual(1);
    expect(maxConsecutiveRest).toBeLessThanOrEqual(1);
  }, 30000);
});

describe('severely over-subscribed: equalise forced consecutive rests', () => {
  // When the bench exceeds the open slots, two-round rests are unavoidable.
  // The scheduler must then share the burden: every player's worst consecutive
  // rest streak should differ by at most 1.
  it('36 players / 4 courts (20 rest each round)', () => {
    const { spread, consecutiveRestSpread } = runSim('oversub-36p', 'sim-36p-4c.csv', 36, 4, 16);
    expect(spread).toBeLessThanOrEqual(1);
    expect(consecutiveRestSpread).toBeLessThanOrEqual(1);
  }, 30000);

  it('24 players / 2 courts (16 rest each round)', () => {
    const { spread, consecutiveRestSpread } = runSim('oversub-24p-2c', 'sim-24p-2c.csv', 24, 2, 16);
    expect(spread).toBeLessThanOrEqual(1);
    expect(consecutiveRestSpread).toBeLessThanOrEqual(1);
  }, 30000);

  it('30 players / 2 courts (22 rest each round, streaks up to 3)', () => {
    const { spread, consecutiveRestSpread } = runSim('oversub-30p-2c', 'sim-30p-2c.csv', 30, 2, 20);
    expect(spread).toBeLessThanOrEqual(1);
    expect(consecutiveRestSpread).toBeLessThanOrEqual(1);
  }, 30000);
});
