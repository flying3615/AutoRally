/**
 * Scheduling fairness & rotation analysis.
 * Runs the real generateMatches() across scenarios and reports:
 *   - play-count spread (requirement 1: equal play counts)
 *   - max consecutive rest (requirement 2: no two rests in a row)
 *
 * Run: npx tsx scripts/sim-report.ts
 */
import { generateMatches } from '../src/renderer/services/matching';
import type { Game } from '../src/shared/types';

interface SimPlayer { id: string; name: string; gender: 'male' | 'female'; level: number; }

function runScenario(
  label: string,
  players: SimPlayer[],
  courtCount: number,
  rounds: number,
) {
  const gameCount = new Map<string, number>();
  const restStreak = new Map<string, number>();
  const maxRestStreak = new Map<string, number>();
  players.forEach(p => { gameCount.set(p.id, 0); restStreak.set(p.id, 0); maxRestStreak.set(p.id, 0); });

  const pastGames: Game[] = [];
  let wideGapCourts = 0;
  let totalCourts = 0;

  for (let round = 1; round <= rounds; round++) {
    const base = Date.now();
    const pool = players.map((p, i) => ({
      id: p.id, name: p.name, gender: p.gender, level: p.level,
      checkinTime: new Date(base - i * 60_000).toISOString(),
    }));
    const matches = generateMatches(pool, courtCount, round, pastGames);
    const playedThisRound = new Set<string>();

    matches.forEach((m, ci) => {
      totalCourts++;
      const levels = [...m.team1, ...m.team2].map(id => players.find(p => p.id === id)!.level);
      if (Math.max(...levels) - Math.min(...levels) > 1) wideGapCourts++;
      for (const id of [...m.team1, ...m.team2]) {
        gameCount.set(id, (gameCount.get(id) ?? 0) + 1);
        playedThisRound.add(id);
      }
      pastGames.push({
        id: `g_r${round}_c${ci + 1}`, sessionId: 'sim', courtNumber: ci + 1,
        team1Player1Id: m.team1[0], team1Player2Id: m.team1[1],
        team2Player1Id: m.team2[0], team2Player2Id: m.team2[1],
        status: 'completed', roundNumber: round, gameType: m.gameType,
        startedAt: null, endedAt: null,
      });
    });

    for (const p of players) {
      if (playedThisRound.has(p.id)) restStreak.set(p.id, 0);
      else {
        const n = (restStreak.get(p.id) ?? 0) + 1;
        restStreak.set(p.id, n);
        if (n > (maxRestStreak.get(p.id) ?? 0)) maxRestStreak.set(p.id, n);
      }
    }
  }

  const counts = [...gameCount.values()];
  const min = Math.min(...counts), max = Math.max(...counts);
  const spread = max - min;
  const streaks = [...maxRestStreak.values()];
  const maxConsec = Math.max(...streaks);
  const minConsec = Math.min(...streaks);
  const consecSpread = maxConsec - minConsec;
  const restPerRound = players.length - courtCount * 4;

  // Theoretical limit: no-2-consecutive is only possible when the bench each
  // round (players.length - 4*courts) does not exceed the open slots (4*courts).
  const feasible = restPerRound <= courtCount * 4;

  const req1 = spread <= 1 ? 'PASS' : 'FAIL';
  const req2 = feasible
    ? (maxConsec <= 1 ? 'PASS' : 'FAIL')
    : (maxConsec <= 1 ? 'PASS' : 'N/A (impossible)');
  // Requirement 3 (over-subscribed only): the forced extra rests should be
  // shared evenly — per-player worst streaks should differ by at most 1.
  const req3 = feasible ? '—' : (consecSpread <= 1 ? 'PASS' : 'FAIL');

  console.log(
    `${label.padEnd(34)} | rest/rd ${String(Math.max(0, restPerRound)).padStart(2)} | ` +
    `games ${min}-${max} spread ${spread} [${req1}] | ` +
    `maxRest ${minConsec}-${maxConsec} [${req2}] | even ${consecSpread} [${req3}] | ` +
    `wideGap ${wideGapCourts}/${totalCourts}`
  );
  return { spread, maxConsec, consecSpread, feasible, req1, req2, req3 };
}

function singleLevel(n: number): SimPlayer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `P${i + 1}`, name: `P${i + 1}`,
    gender: (i % 2 === 0 ? 'female' : 'male') as 'male' | 'female', level: 3,
  }));
}

function multiLevel(n: number): SimPlayer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `P${i + 1}`, name: `P${i + 1}`,
    gender: (i % 2 === 0 ? 'female' : 'male') as 'male' | 'female',
    level: (i % 5) + 1,
  }));
}

console.log('\n=== Requirement 1: equal play counts (spread ≤ 1) ===');
console.log('=== Requirement 2: no two consecutive rests (maxRest ≤ 1) ===\n');

console.log('── Single level (fairness/rotation isolated) ──');
runScenario('16p / 4c (exact fit)', singleLevel(16), 4, 12);
runScenario('18p / 4c (2 rest/round)', singleLevel(18), 4, 12);
runScenario('20p / 4c (4 rest/round)', singleLevel(20), 4, 12);
runScenario('24p / 4c (8 rest/round)', singleLevel(24), 4, 12);
runScenario('28p / 4c (12 rest/round)', singleLevel(28), 4, 12);
runScenario('32p / 4c (16 rest/round, limit)', singleLevel(32), 4, 12);

console.log('\n── Severely over-subscribed (req 3: equalise forced rest streaks) ──');
runScenario('36p / 4c (20 rest/round)', singleLevel(36), 4, 16);
runScenario('48p / 4c (32 rest/round)', singleLevel(48), 4, 20);
runScenario('24p / 2c (16 rest/round)', singleLevel(24), 2, 16);
runScenario('30p / 2c (22 rest/round)', singleLevel(30), 2, 20);

console.log('\n── Mixed levels 1-5 (level-vs-fairness trade-off) ──');
runScenario('20p / 4c mixed-level', multiLevel(20), 4, 12);
runScenario('24p / 4c mixed-level', multiLevel(24), 4, 12);
runScenario('28p / 4c mixed-level', multiLevel(28), 4, 12);

console.log('\n── Level-isolated player (worst case for req 2) ──');
const isolated: SimPlayer[] = [
  { id: 'lone', name: 'Lone', gender: 'male', level: 1 },
  ...Array.from({ length: 4 }, (_, i) => ({ id: `hi${i}`, name: `Hi${i}`, gender: (i % 2 === 0 ? 'male' : 'female') as 'male' | 'female', level: 4 })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: `hj${i}`, name: `Hj${i}`, gender: (i % 2 === 0 ? 'male' : 'female') as 'male' | 'female', level: 5 })),
];
runScenario('9p / 2c, 1 isolated Lv1', isolated, 2, 10);

console.log('\nNote: "OVER" rows exceed the theoretical limit (bench > open slots);');
console.log('no-2-consecutive is mathematically impossible there, by design.\n');
