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

  // 4. Fair court type allocation: equalize playing percentage across genders.
  //    When genders are imbalanced, reduce mixed courts so the minority gender
  //    isn't forced to play every round. Round parity acts as a tiebreaker only
  //    when multiple allocations are equally fair (balanced gender scenario).
  //    Falls back to "best-effort" courts when standard types can't fill available players.
  const maxMixedPossible = Math.min(Math.floor(allMales.length / 2), Math.floor(allFemales.length / 2), courtCount);
  const preferMixed = currentRound % 2 === 1;

  let mixedCourts = 0;
  let maleCourts = 0;
  let femaleCourts = 0;
  let bestFairScore = Infinity;

  for (let mix = 0; mix <= maxMixedPossible; mix++) {
    const availM = allMales.length - mix * 2;
    const availF = allFemales.length - mix * 2;
    const maxMaleC = Math.min(Math.floor(availM / 4), courtCount - mix);

    for (let maleC = 0; maleC <= maxMaleC; maleC++) {
      const femaleC = Math.min(Math.floor(availF / 4), courtCount - mix - maleC);
      if (mix + maleC + femaleC === 0) continue;

      const playingM = mix * 2 + maleC * 4;
      const playingF = mix * 2 + femaleC * 4;
      const rateM = playingM / allMales.length;
      const rateF = playingF / allFemales.length;
      const rateDiff = Math.abs(rateM - rateF);
      const unfilled = courtCount - mix - maleC - femaleC;

      // Primary: minimize rate difference. Tiebreaker: round-type preference.
      const typeScore = preferMixed ? (maxMixedPossible - mix) * 0.0001 : mix * 0.0001;
      const score = rateDiff * 10000 + unfilled * 10 + typeScore;

      if (score < bestFairScore) {
        bestFairScore = score;
        mixedCourts = mix;
        maleCourts = maleC;
        femaleCourts = femaleC;
      }
    }
  }

  // Fallback: fill remaining courts with leftover players regardless of gender balance.
  // This handles skewed leftovers (e.g. 3F+1M → 1 mixed court, or 5F+3M → 1 mixed + 1 leftover).
  const allocatedCourts = mixedCourts + maleCourts + femaleCourts;
  const allocatedM = mixedCourts * 2 + maleCourts * 4;
  const allocatedF = mixedCourts * 2 + femaleCourts * 4;
  const leftoverM = allMales.length - allocatedM;
  const leftoverF = allFemales.length - allocatedF;
  const leftoverCourts = Math.min(
    courtCount - allocatedCourts,
    Math.floor((leftoverM + leftoverF) / 4)
  );
  if (leftoverCourts > 0) {
    // Tag as mixed — team formation below handles asymmetric gender splits
    mixedCourts += leftoverCourts;
  }

  // 5. Generate candidates with different team shuffles for partner diversity.
  //    All candidates use the same player selection (strict fairness).
  //    Variation comes from shuffling within courts before team formation.
  let bestScore = Infinity;
  let bestResult: MatchResult[] = [];

  for (let ci = 0; ci < CANDIDATES; ci++) {
    const seed = currentRound * CANDIDATES + ci;

    // Selected players (deterministic: lowest game count).
    // Fill ideal gender quotas, then backfill shortages from the other gender.
    const idealM = mixedCourts * 2 + maleCourts * 4;
    const idealF = mixedCourts * 2 + femaleCourts * 4;
    let takeM = Math.min(idealM, allMales.length);
    let takeF = Math.min(idealF, allFemales.length);
    // Backfill: if one gender is short, use surplus from the other
    const totalNeed = (mixedCourts + maleCourts + femaleCourts) * 4;
    takeM = Math.min(takeM + Math.max(0, totalNeed - takeM - takeF), allMales.length);
    takeF = Math.min(takeF + Math.max(0, totalNeed - takeM - takeF), allFemales.length);

    const selM = allMales.slice(0, takeM);
    const selF = allFemales.slice(0, takeF);

    // Shuffle selected players for this candidate (partner diversity)
    const shufM = seededShuffle(selM, seed);
    const shufF = seededShuffle(selF, seed + 1);

    const matches: MatchResult[] = [];
    let mi = 0, fi = 0;

    // Build single-gender courts FIRST so they get their allocated players.
    // Mixed courts (built last) flexibly use whatever genders remain.

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

    // Mixed courts — flexible: each court takes up to 2M + 2F, with fallback
    for (let c = 0; c < mixedCourts; c++) {
      const remM = shufM.length - mi;
      const remF = shufF.length - fi;
      if (remM + remF < 4) break;

      // Take up to 2 from each gender, fill rest from the other
      const takeMCourt = Math.min(2, remM);
      const takeFCourt = Math.min(4 - takeMCourt, remF);
      if (takeMCourt + takeFCourt < 4) break;

      // Build teams: pair a male with a female when both available
      const mIds = shufM.slice(mi, mi + takeMCourt).map(p => p.id);
      const fIds = shufF.slice(fi, fi + takeFCourt).map(p => p.id);

      if (takeMCourt === 2 && takeFCourt === 2) {
        // Standard mixed: 1M+1F per team
        matches.push({
          team1: [mIds[0]!, fIds[0]!],
          team2: [mIds[1]!, fIds[1]!],
          gameType: 'mixed',
        });
      } else if (takeMCourt === 1 && takeFCourt >= 2) {
        // 1M + 3F: M+F vs F+F
        matches.push({
          team1: [mIds[0]!, fIds[0]!],
          team2: [fIds[1]!, fIds[2]!],
          gameType: 'mixed',
        });
      } else if (takeMCourt >= 2 && takeFCourt === 1) {
        // 3M + 1F: M+F vs M+M
        matches.push({
          team1: [mIds[0]!, fIds[0]!],
          team2: [mIds[1]!, mIds[2]!],
          gameType: 'mixed',
        });
      } else if (takeFCourt >= 4) {
        // 0M + 4F → really a female-double court
        matches.push({
          team1: [fIds[0]!, fIds[1]!],
          team2: [fIds[2]!, fIds[3]!],
          gameType: 'female-double',
        });
      } else if (takeMCourt >= 4) {
        // 4M + 0F → really a male-double court
        matches.push({
          team1: [mIds[0]!, mIds[1]!],
          team2: [mIds[2]!, mIds[3]!],
          gameType: 'male-double',
        });
      }
      mi += takeMCourt; fi += takeFCourt;
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
