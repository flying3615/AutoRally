export interface SetScore {
  team1: number;
  team2: number;
}

export function isValidBadmintonSetScore(a: number, b: number): boolean {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return false;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi < 21) return false;
  if (hi === 21) return lo <= 19;
  if (hi <= 29) return hi - lo === 2;
  if (hi === 30) return lo === 29;
  return false;
}

export function computeMatchOutcome(sets: SetScore[]): { team1Score: number; team2Score: number; winner: 'team1' | 'team2' } {
  if (sets.length !== 2 && sets.length !== 3) {
    throw new Error('A match needs 2 or 3 set scores');
  }
  for (const set of sets) {
    if (!isValidBadmintonSetScore(set.team1, set.team2)) {
      throw new Error(`Invalid set score: ${set.team1}-${set.team2}`);
    }
  }

  const set1 = sets[0]!;
  const set2 = sets[1]!;
  const set1Winner: 'team1' | 'team2' = set1.team1 > set1.team2 ? 'team1' : 'team2';
  const set2Winner: 'team1' | 'team2' = set2.team1 > set2.team2 ? 'team1' : 'team2';
  const split = set1Winner !== set2Winner;

  if (split && sets.length !== 3) {
    throw new Error('Sets are split 1-1 — a third set is required');
  }
  if (!split && sets.length !== 2) {
    throw new Error('The match is already decided after two sets — remove the third set');
  }

  const team1Score = sets.filter(s => s.team1 > s.team2).length;
  const team2Score = sets.length - team1Score;
  const winner: 'team1' | 'team2' = team1Score > team2Score ? 'team1' : 'team2';
  return { team1Score, team2Score, winner };
}
