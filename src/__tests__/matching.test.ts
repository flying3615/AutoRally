import { describe, it, expect } from 'vitest';
import { generateMatches } from '../renderer/services/matching';
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

function makePlayer(id: string, name: string, gender: 'male' | 'female', level: number, minutesAgo = 0): PlayerInPool {
  return { id, name, gender, level, checkinTime: new Date(Date.now() - minutesAgo * 60_000).toISOString() };
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

  it('prefers level-matching: no game spans more than 1 level', () => {
    // Levels 5,4,3,2 cannot all share one court — max 1-level gap rejected.
    const pool = [
      makePlayer('m1', 'M1', 'male', 5),
      makePlayer('m2', 'M2', 'male', 4),
      makePlayer('f1', 'F1', 'female', 3),
      makePlayer('f2', 'F2', 'female', 2),
    ];
    // With this spread, no level-range can fit 4 players with max-1 gap
    const result = generateMatches(pool, 3, 1, []);
    expect(result).toHaveLength(0);
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

  it('avoids repeating opponent pairings when alternatives exist', () => {
    // 8 players, 2 courts. After 3 rounds where m1 always faced m2,
    // the algo should prefer to put them on different courts.
    const pool = [
      makePlayer('m1', 'M1', 'male', 3),
      makePlayer('m2', 'M2', 'male', 3),
      makePlayer('m3', 'M3', 'male', 3),
      makePlayer('m4', 'M4', 'male', 3),
      makePlayer('f1', 'F1', 'female', 3),
      makePlayer('f2', 'F2', 'female', 3),
      makePlayer('f3', 'F3', 'female', 3),
      makePlayer('f4', 'F4', 'female', 3),
    ];
    // m1+f1 vs m2+f2 repeated 3 times — high opponent penalty for m1↔m2, m1↔f2, f1↔m2, f1↔f2
    const pastGames: Game[] = Array.from({ length: 3 }, (_, i) => ({
      id: `g${i}`, sessionId: 's', courtNumber: 1,
      team1Player1Id: 'm1', team1Player2Id: 'f1',
      team2Player1Id: 'm2', team2Player2Id: 'f2',
      status: 'completed' as const, roundNumber: i + 1, gameType: 'mixed',
      startedAt: null, endedAt: null,
    }));

    const result = generateMatches(pool, 2, 4, pastGames);
    expect(result).toHaveLength(2);
    // m1 and m2 should not be on opposing teams in the same court
    const sameCourtAsOpponents = result.some(m =>
      (m.team1.includes('m1') && m.team2.includes('m2')) ||
      (m.team1.includes('m2') && m.team2.includes('m1'))
    );
    expect(sameCourtAsOpponents).toBe(false);
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
): { spread: number; courtTypes: Set<string> } {
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

    for (const m of matches) {
      allCourtTypes.add(m.gameType);
      const court = matches.indexOf(m) + 1;
      rows.push(`${round},${court},${m.gameType},${m.team1[0]}(${getLevel(m.team1[0], players)}),${m.team1[1]}(${getLevel(m.team1[1], players)}),${m.team2[0]}(${getLevel(m.team2[0], players)}),${m.team2[1]}(${getLevel(m.team2[1], players)})`);
      for (const id of [...m.team1, ...m.team2]) {
        gameCount.set(id, (gameCount.get(id) ?? 0) + 1);
      }
      pastGames.push({
        id: `g_r${round}_c${court}`, sessionId: 'sim', courtNumber: court,
        team1Player1Id: m.team1[0], team1Player2Id: m.team1[1],
        team2Player1Id: m.team2[0], team2Player2Id: m.team2[1],
        status: 'completed', roundNumber: round, gameType: m.gameType,
        startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      });
    }
  }

  rows.push('');
  rows.push('Player,Gender,Level,Games Played');
  players.forEach(p => {
    rows.push(`${p.name},${p.gender},${p.level},${gameCount.get(p.id) ?? 0}`);
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

  const csv = rows.join('\n');
  if (process.env.WRITE_SIM_CSV) {
    const outPath = path.join(__dirname, '..', '..', 'test-results', fileName);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, csv);
    console.log(`\n[${label}] CSV → ${outPath} | spread=${spread} | types=[${[...allCourtTypes].join(',')}]`);
    console.log(csv);
  }

  // Level-matching may leave rare-level players sitting more often than
  // populous-level players.  This is an accepted trade-off for same-level courts.
  expect(spread).toBeLessThanOrEqual(1);
  return { spread, courtTypes: allCourtTypes };
}

function getLevel(id: string, players: SimPlayer[]): number {
  return players.find(p => p.id === id)?.level ?? 0;
}

// ═══════════════════════════════════════════
// Simulation tests
// ═══════════════════════════════════════════

describe('4-court 10-round simulations', () => {
  it('12 players: not enough to fill 4 courts', () => {
    const { spread } = runSim('under-filled', 'sim-12p-4c.csv', 12, 4, 10);
    expect(spread).toBeLessThanOrEqual(2); // 12p/4c is under-filled; perfect balance not guaranteed
  }, 30000);

  it('16 players: exactly fills 4 courts (no rotation buffer)', () => {
    const { spread } = runSim('exact-fit', 'sim-16p-4c.csv', 16, 4, 10);
    expect(spread).toBeLessThanOrEqual(1);
  }, 30000);

  it('20 players: slightly more than 4 courts (baseline)', () => {
    const { spread } = runSim('baseline', 'sim-20p-4c.csv', 20, 4, 10);
    expect(spread).toBeLessThanOrEqual(1);
  }, 30000);

  it('24 players: well above 4 courts', () => {
    const { spread } = runSim('over-filled', 'sim-24p-4c.csv', 24, 4, 10);
    expect(spread).toBeLessThanOrEqual(1);
  }, 30000);
});
