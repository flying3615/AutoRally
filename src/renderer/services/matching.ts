import type { Attendance, Game } from '../../shared/types';

interface PlayerInPool {
  id: string;
  name: string;
  gender: 'male' | 'female';
  level: number;
  checkinTime: string;
}

interface MatchResult {
  team1: [string, string];
  team2: [string, string];
  gameType: 'same-gender' | 'mixed';
}

export function generateMatches(
  pool: PlayerInPool[],
  courtCount: number,
  currentRound: number,
  pastGames: Game[],
): MatchResult[] {
  if (pool.length < 4) return [];

  const sorted = [...pool].sort((a, b) =>
    new Date(a.checkinTime).getTime() - new Date(b.checkinTime).getTime()
  );

  const isSameGenderRound = currentRound % 2 === 1;
  const results: MatchResult[] = [];
  const used = new Set<string>();

  // Separate by gender for matching
  const males = sorted.filter(p => p.gender === 'male');
  const females = sorted.filter(p => p.gender === 'female');

  const partnerHistory = buildPartnerHistory(pastGames);

  if (isSameGenderRound) {
    // Try same-gender matches first
    const maleMatches = matchGroup(males, courtCount, used, partnerHistory);
    results.push(...maleMatches.map(m => ({ ...m, gameType: 'same-gender' as const })));

    const remainingCourts = courtCount - results.length;
    if (remainingCourts > 0 && females.length >= 4) {
      const femaleMatches = matchGroup(females, remainingCourts, used, partnerHistory);
      results.push(...femaleMatches.map(m => ({ ...m, gameType: 'same-gender' as const })));
    }
  } else {
    // Mixed doubles: need at least 2 males and 2 females per match
    const mixedMatches = matchMixed(males, females, courtCount, used, partnerHistory);
    results.push(...mixedMatches.map(m => ({ ...m, gameType: 'mixed' as const })));
  }

  // Fill remaining courts with any available players (fallback)
  const remainingCourts = courtCount - results.length;
  if (remainingCourts > 0) {
    const remaining = sorted.filter(p => !used.has(p.id));
    const fallback = matchByLevel(remaining, remainingCourts, used, partnerHistory);
    for (const m of fallback) {
      const hasMixed = m.team1[0] && m.team2[0] &&
        getPlayerGender(m.team1[0], pool) !== getPlayerGender(m.team1[1], pool);
      results.push({ ...m, gameType: hasMixed ? 'mixed' : 'same-gender' });
    }
  }

  return results.slice(0, courtCount);
}

function matchGroup(
  players: PlayerInPool[],
  maxCourts: number,
  used: Set<string>,
  partnerHistory: Map<string, Set<string>>,
): MatchResult[] {
  const results: MatchResult[] = [];
  const available = players.filter(p => !used.has(p.id));

  for (let i = 0; i < available.length - 3 && results.length < maxCourts; i += 4) {
    const group = available.slice(i, i + 4);
    if (group.length < 4) break;

    const sorted = [...group].sort((a, b) => a.level - b.level);
    // Strongest + weakest vs middle two
    const team1: [string, string] = [sorted[3]!.id, sorted[0]!.id];
    const team2: [string, string] = [sorted[2]!.id, sorted[1]!.id];

    for (const p of group) used.add(p.id);
    results.push({ team1, team2, gameType: 'same-gender' });
  }

  return results;
}

function matchMixed(
  males: PlayerInPool[],
  females: PlayerInPool[],
  maxCourts: number,
  used: Set<string>,
  _partnerHistory: Map<string, Set<string>>,
): MatchResult[] {
  const results: MatchResult[] = [];
  const availMales = males.filter(p => !used.has(p.id)).sort((a, b) => b.level - a.level);
  const availFemales = females.filter(p => !used.has(p.id)).sort((a, b) => b.level - a.level);

  const matchCount = Math.min(
    maxCourts,
    Math.floor(availMales.length / 2),
    Math.floor(availFemales.length / 2),
  );

  for (let i = 0; i < matchCount; i++) {
    const m1 = availMales[i * 2]!;
    const m2 = availMales[i * 2 + 1]!;
    const f1 = females[i * 2]!;
    const f2 = females[i * 2 + 1]!;

    // Balance teams: higher male + lower female vs lower male + higher female
    const team1: [string, string] = [m1.id, f2.id];
    const team2: [string, string] = [m2.id, f1.id];

    used.add(m1.id);
    used.add(m2.id);
    used.add(f1.id);
    used.add(f2.id);
    results.push({ team1, team2, gameType: 'mixed' });
  }

  return results;
}

function matchByLevel(
  players: PlayerInPool[],
  maxCourts: number,
  used: Set<string>,
  _partnerHistory: Map<string, Set<string>>,
): MatchResult[] {
  const results: MatchResult[] = [];
  const sorted = players.sort((a, b) => b.level - a.level);

  for (let i = 0; i < sorted.length - 3 && results.length < maxCourts; i += 4) {
    const group = sorted.slice(i, i + 4);
    if (group.length < 4) break;

    const byLevel = [...group].sort((a, b) => a.level - b.level);
    const team1: [string, string] = [byLevel[3]!.id, byLevel[0]!.id];
    const team2: [string, string] = [byLevel[2]!.id, byLevel[1]!.id];

    for (const p of group) used.add(p.id);
    results.push({ team1, team2, gameType: 'same-gender' });
  }

  return results;
}

function buildPartnerHistory(games: Game[]): Map<string, Set<string>> {
  const history = new Map<string, Set<string>>();
  for (const g of games) {
    addPartner(history, g.team1Player1Id, g.team1Player2Id);
    addPartner(history, g.team2Player1Id, g.team2Player2Id);
  }
  return history;
}

function addPartner(history: Map<string, Set<string>>, p1: string, p2: string) {
  if (!history.has(p1)) history.set(p1, new Set());
  if (!history.has(p2)) history.set(p2, new Set());
  history.get(p1)!.add(p2);
  history.get(p2)!.add(p1);
}

function getPlayerGender(id: string, pool: PlayerInPool[]): 'male' | 'female' {
  return pool.find(p => p.id === id)?.gender ?? 'male';
}
