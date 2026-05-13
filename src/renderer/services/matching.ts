import type { Game } from '../../shared/types';

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
  gameType: 'mixed' | 'male-double' | 'female-double' | 'open-double';
}

type GameType = MatchResult['gameType'];

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
  const countedGames = pastGames.filter(g => g.status !== 'pending');

  // 1. Count games per player (fairness)
  const gameCount = new Map<string, number>();
  for (const g of countedGames) {
    for (const id of [g.team1Player1Id, g.team1Player2Id, g.team2Player1Id, g.team2Player2Id]) {
      gameCount.set(id, (gameCount.get(id) ?? 0) + 1);
    }
  }
  for (const p of pool) gameCount.set(p.id, gameCount.get(p.id) ?? 0);

  // 2. Count past partnerships
  const partnerCount = new Map<string, number>();
  const partnerKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;
  for (const g of countedGames) {
    const k1 = partnerKey(g.team1Player1Id, g.team1Player2Id);
    const k2 = partnerKey(g.team2Player1Id, g.team2Player2Id);
    partnerCount.set(k1, (partnerCount.get(k1) ?? 0) + 1);
    partnerCount.set(k2, (partnerCount.get(k2) ?? 0) + 1);
  }

  // 3. Global fairness sort: fewest games first, then earlier checkin
  const sorted = [...pool].sort((a, b) => {
    const dc = (gameCount.get(a.id) ?? 0) - (gameCount.get(b.id) ?? 0);
    if (dc !== 0) return dc;
    return new Date(a.checkinTime).getTime() - new Date(b.checkinTime).getTime();
  });

  // Group by level (pre-sorted by fairness)
  const byLevel = new Map<number, PlayerInPool[]>();
  for (let l = 1; l <= 5; l++) byLevel.set(l, []);
  for (const p of sorted) byLevel.get(p.level)!.push(p);

  // 4. Generate candidates: shuffle within levels for partner diversity,
  //    then greedily form courts scanning fairness-first for each court.
  let bestScore = Infinity;
  let bestResult: MatchResult[] = [];

  for (let ci = 0; ci < CANDIDATES; ci++) {
    // Shuffle within each level for this candidate
    const shuffled = new Map<number, PlayerInPool[]>();
    for (let l = 1; l <= 5; l++) {
      shuffled.set(l, seededShuffle(byLevel.get(l)!, currentRound * CANDIDATES + ci + l));
    }

    const used = new Set<string>();
    const matches: MatchResult[] = [];

    // Greedy: one court at a time, seed player selection.
    // Rare levels (1, 5) get priority so their potential partners at adjacent
    // levels aren't consumed first by populous mid-level groups.
    // Build a PER-CANDIDATE seed order from the shuffled level lists so that
    // different candidates fill courts in different orders, improving the
    // chance that at least one candidate fills every court.
    const skipped = new Set<string>();
    const rarityIndex = (l: number) => l <= 1 || l >= 5 ? 0 : l === 2 || l === 4 ? 1 : 2;

    // Seed order: rarity group first, then sorted deterministically by
    // game count (fewest first), then checkin time.  This guarantees the
    // least-played players are always first in line to play across all
    // candidates.  Partner diversity comes from the per-candidate shuffled
    // lists used inside court formation, not from the seed order.
    const seedOrder: PlayerInPool[] = [];
    for (const rarity of [0, 1, 2]) {
      const group: PlayerInPool[] = [];
      for (let l = 1; l <= 5; l++) {
        if (rarityIndex(l) === rarity) group.push(...byLevel.get(l)!);
      }
      group.sort((a, b) => {
        const dc = (gameCount.get(a.id) ?? 0) - (gameCount.get(b.id) ?? 0);
        if (dc !== 0) return dc;
        return new Date(a.checkinTime).getTime() - new Date(b.checkinTime).getTime();
      });
      seedOrder.push(...group);
    }

    for (let court = 0; court < courtCount; court++) {
      let bestMatch: MatchResult | null = null;
      let bestMatchScore = Infinity;

      // Try seed players in fairness order until one works
      for (const seed of seedOrder) {
        if (used.has(seed.id) || skipped.has(seed.id)) continue;
        const targetLevel = seed.level;
        const levelRanges: [number, number][] = [[targetLevel, targetLevel], [Math.max(1, targetLevel - 1), Math.min(5, targetLevel + 1)]];
        for (const lr of levelRanges) {
          const minL = lr[0];
          const maxL = lr[1];
          const rangeM: PlayerInPool[] = [];
          const rangeF: PlayerInPool[] = [];
          for (let l = minL; l <= maxL; l++) {
            for (const p of shuffled.get(l)!) {
              if (!used.has(p.id) && !skipped.has(p.id)) {
                (p.gender === 'male' ? rangeM : rangeF).push(p);
              }
            }
          }

          // Sort by game count (fairness) so low-game-count partners are picked first.
          // The shuffle above only affects same-count tie-breaking for partner variety.
          const sortByGc = (a: PlayerInPool, b: PlayerInPool) => (gameCount.get(a.id) ?? 0) - (gameCount.get(b.id) ?? 0);
          rangeM.sort(sortByGc);
          rangeF.sort(sortByGc);

          if (rangeM.length + rangeF.length < 4) continue;

          const comps: { mc: number; fc: number; type: GameType }[] = [];
          if (rangeM.length >= 2 && rangeF.length >= 2) comps.push({ mc: 2, fc: 2, type: 'mixed' });
          if (rangeM.length >= 4) comps.push({ mc: 4, fc: 0, type: 'male-double' });
          if (rangeF.length >= 4) comps.push({ mc: 0, fc: 4, type: 'female-double' });
          if (rangeM.length >= 3 && rangeF.length >= 1) comps.push({ mc: 3, fc: 1, type: 'open-double' });
          if (rangeM.length >= 1 && rangeF.length >= 3) comps.push({ mc: 1, fc: 3, type: 'open-double' });

          for (const comp of comps) {
            const sm = rangeM.slice(0, comp.mc);
            const sf = rangeF.slice(0, comp.fc);
            const all = [...sm, ...sf];
            const levels = all.map(p => p.level);

            if (Math.max(...levels) - Math.min(...levels) > 1) continue;

            let team1: [string, string], team2: [string, string];
            if (comp.type === 'mixed') {
              team1 = [sm[0]!.id, sf[0]!.id];
              team2 = [sm[1]!.id, sf[1]!.id];
            } else if (comp.type === 'male-double') {
              team1 = [sm[0]!.id, sm[1]!.id];
              team2 = [sm[2]!.id, sm[3]!.id];
            } else if (comp.type === 'female-double') {
              team1 = [sf[0]!.id, sf[1]!.id];
              team2 = [sf[2]!.id, sf[3]!.id];
            } else if (comp.mc === 1) {
              team1 = [sm[0]!.id, sf[0]!.id];
              team2 = [sf[1]!.id, sf[2]!.id];
            } else {
              team1 = [sm[0]!.id, sf[0]!.id];
              team2 = [sm[1]!.id, sm[2]!.id];
            }

            const pPenalty =
              (partnerCount.get(partnerKey(team1[0], team1[1])) ?? 0) +
              (partnerCount.get(partnerKey(team2[0], team2[1])) ?? 0);
            const gPenalty = all.reduce((s, p) => s + (gameCount.get(p.id) ?? 0), 0);

            const score = gPenalty * 1000 + pPenalty * 100;

            if (score < bestMatchScore) {
              bestMatchScore = score;
              bestMatch = { team1, team2, gameType: comp.type };
            }
          }
        }
        if (bestMatch) break;
        // This seed can't form a court — skip them for this round
        skipped.add(seed.id);
      }

      if (bestMatch) {
        matches.push(bestMatch);
        for (const id of [...bestMatch!.team1, ...bestMatch!.team2]) used.add(id);
      }
    }

    // Score this candidate: unfilled courts > fairness > level spread > partner repeats
    let levelPenalty = 0;
    for (const m of matches) {
      const levels = [...m.team1, ...m.team2].map(id => pool.find(p => p.id === id)!.level);
      levelPenalty += Math.max(...levels) - Math.min(...levels);
    }

    let partnerPenalty = 0;
    for (const m of matches) {
      partnerPenalty += (partnerCount.get(partnerKey(m.team1[0], m.team1[1])) ?? 0);
      partnerPenalty += (partnerCount.get(partnerKey(m.team2[0], m.team2[1])) ?? 0);
    }

    // Fairness: penalize picking players who already have many more games than
    // the pool minimum. This steers the candidate toward equal play time.
    const allGc = [...gameCount.values()];
    const poolMin = allGc.length > 0 ? Math.min(...allGc) : 0;
    let fairnessPenalty = 0;
    for (const m of matches) {
      for (const id of [...m.team1, ...m.team2]) {
        fairnessPenalty += (gameCount.get(id) ?? 0) - poolMin;
      }
    }

    const unfilled = Math.max(0, courtCount - matches.length);
    const score = unfilled * 100000 + fairnessPenalty * 5000 + levelPenalty * 1000 + partnerPenalty * 100;

    if (score < bestScore) {
      bestScore = score;
      bestResult = matches;
    }
  }

  return bestResult.slice(0, courtCount);
}
