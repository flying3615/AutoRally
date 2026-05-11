import type { Attendance, Game } from '../../shared/types';

interface PlayerInPool {
  id: string;
  name: string;
  gender: 'male' | 'female';
  level: number;
  checkinTime: string;
}

export interface MatchResult {
  team1: [string, string];
  team2: [string, string];
  gameType: 'mixed' | 'male-double' | 'female-double';
}

const CANDIDATES = 30;

// ── Seeded random ──

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// ── Main entry point ──

export function generateMatches(
  pool: PlayerInPool[],
  courtCount: number,
  currentRound: number,
  pastGames: Game[],
): MatchResult[] {
  if (pool.length < 4) return [];

  // 1. Count games per player
  const gameCount = new Map<string, number>();
  for (const g of pastGames) {
    for (const id of [g.team1Player1Id, g.team1Player2Id, g.team2Player1Id, g.team2Player2Id]) {
      gameCount.set(id, (gameCount.get(id) ?? 0) + 1);
    }
  }
  for (const p of pool) gameCount.set(p.id, gameCount.get(p.id) ?? 0);

  // 2. Count past partnerships
  const partnerCount = new Map<string, number>();
  const partnerKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;
  for (const g of pastGames) {
    const k1 = partnerKey(g.team1Player1Id, g.team1Player2Id);
    const k2 = partnerKey(g.team2Player1Id, g.team2Player2Id);
    partnerCount.set(k1, (partnerCount.get(k1) ?? 0) + 1);
    partnerCount.set(k2, (partnerCount.get(k2) ?? 0) + 1);
  }

  // 3. Greedy fairness sort: lowest game count first
  const byCount = [...pool].sort((a, b) => {
    const dc = (gameCount.get(a.id) ?? 0) - (gameCount.get(b.id) ?? 0);
    if (dc !== 0) return dc;
    // Tiebreaker: earlier checkin first
    return new Date(a.checkinTime).getTime() - new Date(b.checkinTime).getTime();
  });

  const allMales = byCount.filter(p => p.gender === 'male');
  const allFemales = byCount.filter(p => p.gender === 'female');

  // 4. Court type allocation: maximize mixed courts (most balanced gender usage)
  const maxMixed = Math.min(Math.floor(allMales.length / 2), Math.floor(allFemales.length / 2), courtCount);
  const mixedCourts = maxMixed;
  const remainingCourts = courtCount - mixedCourts;
  const surplusM = allMales.length - mixedCourts * 2;
  const surplusF = allFemales.length - mixedCourts * 2;
  const maleCourts = Math.min(Math.floor(surplusM / 4), remainingCourts);
  const femaleCourts = Math.min(Math.floor(surplusF / 4), remainingCourts - maleCourts);

  // 5. Generate candidates with different team shuffles for partner diversity.
  //    All candidates use the same player selection (strict fairness).
  //    Variation comes from shuffling within courts before team formation.
  let bestScore = Infinity;
  let bestResult: MatchResult[] = [];

  for (let ci = 0; ci < CANDIDATES; ci++) {
    const seed = currentRound * CANDIDATES + ci;

    // Selected players (deterministic: lowest game count)
    const selM = allMales.slice(0, mixedCourts * 2 + maleCourts * 4);
    const selF = allFemales.slice(0, mixedCourts * 2 + femaleCourts * 4);

    // Shuffle selected players for this candidate (partner diversity)
    const shufM = seededShuffle(selM, seed);
    const shufF = seededShuffle(selF, seed + 1);

    const matches: MatchResult[] = [];
    let mi = 0, fi = 0;

    // Mixed courts
    for (let c = 0; c < mixedCourts; c++) {
      if (mi + 2 > shufM.length || fi + 2 > shufF.length) break;
      matches.push({
        team1: [shufM[mi]!.id, shufF[fi]!.id],
        team2: [shufM[mi + 1]!.id, shufF[fi + 1]!.id],
        gameType: 'mixed',
      });
      mi += 2; fi += 2;
    }

    // Male-double courts
    for (let c = 0; c < maleCourts; c++) {
      if (mi + 4 > shufM.length) break;
      matches.push({
        team1: [shufM[mi]!.id, shufM[mi + 1]!.id],
        team2: [shufM[mi + 2]!.id, shufM[mi + 3]!.id],
        gameType: 'male-double',
      });
      mi += 4;
    }

    // Female-double courts
    for (let c = 0; c < femaleCourts; c++) {
      if (fi + 4 > shufF.length) break;
      matches.push({
        team1: [shufF[fi]!.id, shufF[fi + 1]!.id],
        team2: [shufF[fi + 2]!.id, shufF[fi + 3]!.id],
        gameType: 'female-double',
      });
      fi += 4;
    }

    // 6. Score this candidate
    let levelPenalty = 0;
    for (const m of matches) {
      const allIds = [...m.team1, ...m.team2];
      const levels = allIds.map(id => pool.find(p => p.id === id)!.level);
      const hasL5 = levels.some(l => l === 5);
      const hasL1 = levels.some(l => l === 1);
      const hasHigh = levels.some(l => l >= 4);
      const hasLow = levels.some(l => l <= 3);
      if (hasL5 && hasL1) levelPenalty += 10;
      else if (hasHigh && hasLow) levelPenalty += Math.min(
        levels.filter(l => l >= 4).length,
        levels.filter(l => l <= 3).length
      );
    }

    let partnerPenalty = 0;
    for (const m of matches) {
      const k1 = partnerKey(m.team1[0], m.team1[1]);
      const k2 = partnerKey(m.team2[0], m.team2[1]);
      partnerPenalty += partnerCount.get(k1) ?? 0;
      partnerPenalty += partnerCount.get(k2) ?? 0;
    }

    const unfilled = Math.max(0, courtCount - matches.length);
    const score = levelPenalty * 100 + partnerPenalty * 50 + unfilled * 10;

    if (score < bestScore) {
      bestScore = score;
      bestResult = matches;
    }
  }

  return bestResult.slice(0, courtCount);
}
