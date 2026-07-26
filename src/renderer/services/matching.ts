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
const MAX_PLAYERS_PER_LEVEL_WINDOW = 36;
const MAX_COURT_CANDIDATES = 1200;
const MAX_EXACT_CANDIDATES = 900;
const BEAM_WIDTH = 160;
const RELAXED_LEVEL_PENALTY_OFFSET = 100;

interface CourtCandidate extends MatchResult {
  ids: string[];
  mask: bigint;
  restUrgency: number;
  levelPenalty: number;
  fairnessPenalty: number;
  groupRepeatPenalty: number;
  typePenalty: number;
  teamBalancePenalty: number;
  partnerPenalty: number;
  opponentPenalty: number;
  waitPenalty: number;
  tieBreak: number;
}

interface SearchState {
  matches: MatchResult[];
  mask: bigint;
  count: number;
  restUrgency: number;
  levelPenalty: number;
  fairnessPenalty: number;
  groupRepeatPenalty: number;
  typePenalty: number;
  teamBalancePenalty: number;
  partnerPenalty: number;
  opponentPenalty: number;
  waitPenalty: number;
  tieBreak: number;
}

function hashString(value: string, seed: number): number {
  let h = seed || 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function compareCandidate(a: CourtCandidate, b: CourtCandidate): number {
  return (
    // Courts that re-seat the longest-resting players come first, so the beam
    // search considers them before the candidate pool is truncated.
    b.restUrgency - a.restUrgency ||
    a.fairnessPenalty - b.fairnessPenalty ||
    a.groupRepeatPenalty - b.groupRepeatPenalty ||
    a.partnerPenalty - b.partnerPenalty ||
    a.opponentPenalty - b.opponentPenalty ||
    a.levelPenalty - b.levelPenalty ||
    a.typePenalty - b.typePenalty ||
    a.teamBalancePenalty - b.teamBalancePenalty ||
    a.waitPenalty - b.waitPenalty ||
    a.tieBreak - b.tieBreak
  );
}

function compareState(a: SearchState, b: SearchState): number {
  return (
    // 1. Fill as many courts as possible.
    b.count - a.count ||
    // 2. Rest fairness: seat the longest-resting players first. When courts
    //    suffice this means no one rests twice in a row; when they don't, it
    //    equalises how long each player is forced to sit consecutively.
    b.restUrgency - a.restUrgency ||
    // 3. Equal play counts: prefer courts built from the fewest-played players,
    //    even when that means a wider level gap.
    a.fairnessPenalty - b.fairnessPenalty ||
    // 4. Avoid repeating a recent court or player relationships when possible.
    a.groupRepeatPenalty - b.groupRepeatPenalty ||
    a.partnerPenalty - b.partnerPenalty ||
    a.opponentPenalty - b.opponentPenalty ||
    // 5. Among equally-diverse arrangements, prefer the tightest level match.
    a.levelPenalty - b.levelPenalty ||
    a.typePenalty - b.typePenalty ||
    a.teamBalancePenalty - b.teamBalancePenalty ||
    a.waitPenalty - b.waitPenalty ||
    a.tieBreak - b.tieBreak
  );
}

function selectBestMatches(
  allCandidates: CourtCandidate[],
  poolSize: number,
  courtCount: number,
  candidateLimit = MAX_COURT_CANDIDATES,
): MatchResult[] {
  const exactSearch = poolSize <= 16 && allCandidates.length <= MAX_EXACT_CANDIDATES;
  const keepAllCandidates = poolSize <= 16;
  const candidates = allCandidates.slice(0, keepAllCandidates ? undefined : candidateLimit);
  if (candidates.length === 0) return [];

  let states: SearchState[] = [{
    matches: [],
    mask: 0n,
    count: 0,
    restUrgency: 0,
    levelPenalty: 0,
    fairnessPenalty: 0,
    groupRepeatPenalty: 0,
    typePenalty: 0,
    teamBalancePenalty: 0,
    partnerPenalty: 0,
    opponentPenalty: 0,
    waitPenalty: 0,
    tieBreak: 0,
  }];

  for (const candidate of candidates) {
    const additions: SearchState[] = [];
    for (const state of states) {
      if (state.count >= courtCount || (state.mask & candidate.mask) !== 0n) continue;
      additions.push({
        matches: [...state.matches, {
          team1: candidate.team1,
          team2: candidate.team2,
          gameType: candidate.gameType,
        }],
        mask: state.mask | candidate.mask,
        count: state.count + 1,
        restUrgency: state.restUrgency + candidate.restUrgency,
        levelPenalty: state.levelPenalty + candidate.levelPenalty,
        fairnessPenalty: state.fairnessPenalty + candidate.fairnessPenalty,
        groupRepeatPenalty: state.groupRepeatPenalty + candidate.groupRepeatPenalty,
        typePenalty: state.typePenalty + candidate.typePenalty,
        teamBalancePenalty: state.teamBalancePenalty + candidate.teamBalancePenalty,
        partnerPenalty: state.partnerPenalty + candidate.partnerPenalty,
        opponentPenalty: state.opponentPenalty + candidate.opponentPenalty,
        waitPenalty: state.waitPenalty + candidate.waitPenalty,
        tieBreak: state.tieBreak + candidate.tieBreak,
      });
    }
    if (additions.length === 0) continue;

    const deduped = new Map<string, SearchState>();
    const beamWidth = exactSearch ? Number.MAX_SAFE_INTEGER : BEAM_WIDTH;
    for (const state of [...states, ...additions].sort(compareState)) {
      const key = state.mask.toString();
      if (!deduped.has(key)) deduped.set(key, state);
      if (deduped.size >= beamWidth) break;
    }
    states = [...deduped.values()];
  }

  states.sort(compareState);
  return (states[0]?.matches ?? []).slice(0, courtCount);
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

  // Consecutive-rest streak per pool player: how many of the most-recent rounds
  // they have sat out in a row. Drives two goals:
  //   • no two consecutive rests when courts allow (streak ≤ 1 is the common case)
  //   • when courts are too few to avoid it, equalise streaks so the forced
  //     extra rests are shared, not dumped on the same unlucky players.
  const roundsDesc = [...new Set(countedGames.map(g => g.roundNumber))].sort((a, b) => b - a);
  const latestRoundGroupKeys = new Set(
    roundsDesc.length === 0
      ? []
      : countedGames
        .filter(g => g.roundNumber === roundsDesc[0])
        .map(g => [
          g.team1Player1Id,
          g.team1Player2Id,
          g.team2Player1Id,
          g.team2Player2Id,
        ].sort().join('|')),
  );
  const playedInRound = new Map<number, Set<string>>();
  for (const g of countedGames) {
    let set = playedInRound.get(g.roundNumber);
    if (!set) { set = new Set(); playedInRound.set(g.roundNumber, set); }
    set.add(g.team1Player1Id);
    set.add(g.team1Player2Id);
    set.add(g.team2Player1Id);
    set.add(g.team2Player2Id);
  }
  const restStreak = new Map<string, number>();
  for (const p of pool) {
    let streak = 0;
    for (const r of roundsDesc) {
      if (playedInRound.get(r)?.has(p.id)) break;
      streak++;
    }
    restStreak.set(p.id, streak);
  }
  // Players who rested last round (streak ≥ 1) must be re-seatable; used to
  // widen level windows if one of them is otherwise un-pairable.
  const restedLastRound = new Set<string>();
  for (const p of pool) {
    if ((restStreak.get(p.id) ?? 0) >= 1) restedLastRound.add(p.id);
  }

  const playerIndex = new Map(pool.map((p, i) => [p.id, i]));

  // 2. Count past partnerships and opponent pairings
  const partnerCount = new Map<string, number>();
  const opponentCount = new Map<string, number>();
  const pairKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;
  const partnerKey = pairKey;
  for (const g of countedGames) {
    const k1 = partnerKey(g.team1Player1Id, g.team1Player2Id);
    const k2 = partnerKey(g.team2Player1Id, g.team2Player2Id);
    partnerCount.set(k1, (partnerCount.get(k1) ?? 0) + 1);
    partnerCount.set(k2, (partnerCount.get(k2) ?? 0) + 1);
    for (const id1 of [g.team1Player1Id, g.team1Player2Id]) {
      for (const id2 of [g.team2Player1Id, g.team2Player2Id]) {
        const ko = pairKey(id1, id2);
        opponentCount.set(ko, (opponentCount.get(ko) ?? 0) + 1);
      }
    }
  }

  // 3. Global fairness sort: fewest games first, then earlier checkin
  const sorted = [...pool].sort((a, b) => {
    const dc = (gameCount.get(a.id) ?? 0) - (gameCount.get(b.id) ?? 0);
    if (dc !== 0) return dc;
    return new Date(a.checkinTime).getTime() - new Date(b.checkinTime).getTime();
  });

  const waitRank = new Map(sorted.map((p, i) => [p.id, i]));
  const poolMin = Math.min(...[...gameCount.values()]);
  const candidateByKey = new Map<string, CourtCandidate>();
  const seed = currentRound * CANDIDATES;

  const windows: [number, number][] = [];
  for (let l = 1; l <= 5; l++) windows.push([l, l]);
  for (let l = 1; l < 5; l++) windows.push([l, l + 1]);

  const playerRank = (p: PlayerInPool) =>
    (gameCount.get(p.id) ?? 0) * 10000 +
    (waitRank.get(p.id) ?? 0) * 10 +
    (hashString(p.id, seed) % 10);

  const addCandidate = (group: PlayerInPool[], allowWideLevelGap = false) => {
    const levels = group.map(p => p.level);
    const levelSpread = Math.max(...levels) - Math.min(...levels);
    if (!allowWideLevelGap && levelSpread > 1) return;
    const levelPenalty = levelSpread <= 1
      ? levelSpread
      : RELAXED_LEVEL_PENALTY_OFFSET + levelSpread;

    const males = group.filter(p => p.gender === 'male');
    const females = group.filter(p => p.gender === 'female');
    let gameType: GameType | null = null;
    if (males.length === 2 && females.length === 2) gameType = 'mixed';
    else if (males.length === 4) gameType = 'male-double';
    else if (females.length === 4) gameType = 'female-double';
    else if (males.length === 3 || females.length === 3) gameType = 'open-double';
    if (!gameType) return;

    const ids = group.map(p => p.id).sort();
    const key = ids.join('|');
    if (candidateByKey.has(key)) return;

    const partitions: [[number, number], [number, number]][] = [
      [[0, 1], [2, 3]],
      [[0, 2], [1, 3]],
      [[0, 3], [1, 2]],
    ];
    let bestTeams: {
      team1: [string, string];
      team2: [string, string];
      balance: number;
      partners: number;
      opponents: number;
      tie: number;
    } | null = null;

    for (const [left, right] of partitions) {
      const t1 = [group[left[0]]!, group[left[1]]!] as const;
      const t2 = [group[right[0]]!, group[right[1]]!] as const;
      if (gameType === 'mixed') {
        const t1Mixed = t1[0].gender !== t1[1].gender;
        const t2Mixed = t2[0].gender !== t2[1].gender;
        if (!t1Mixed || !t2Mixed) continue;
      }

      const t1Level = t1[0].level + t1[1].level;
      const t2Level = t2[0].level + t2[1].level;
      const balance = Math.abs(t1Level - t2Level);
      const partners =
        (partnerCount.get(partnerKey(t1[0].id, t1[1].id)) ?? 0) +
        (partnerCount.get(partnerKey(t2[0].id, t2[1].id)) ?? 0);
      const opponents =
        (opponentCount.get(pairKey(t1[0].id, t2[0].id)) ?? 0) +
        (opponentCount.get(pairKey(t1[0].id, t2[1].id)) ?? 0) +
        (opponentCount.get(pairKey(t1[1].id, t2[0].id)) ?? 0) +
        (opponentCount.get(pairKey(t1[1].id, t2[1].id)) ?? 0);
      const tie = hashString(`${t1[0].id}|${t1[1].id}|${t2[0].id}|${t2[1].id}`, seed);
      const current = {
        team1: [t1[0].id, t1[1].id] as [string, string],
        team2: [t2[0].id, t2[1].id] as [string, string],
        balance,
        partners,
        opponents,
        tie,
      };

      const better =
        !bestTeams ||
        partners < bestTeams.partners ||
        (partners === bestTeams.partners && opponents < bestTeams.opponents) ||
        (partners === bestTeams.partners && opponents === bestTeams.opponents && balance < bestTeams.balance) ||
        (partners === bestTeams.partners && opponents === bestTeams.opponents && balance === bestTeams.balance && tie < bestTeams.tie);
      if (better) bestTeams = current;
    }
    if (!bestTeams) return;

    let mask = 0n;
    for (const id of ids) {
      const idx = playerIndex.get(id);
      if (idx === undefined) return;
      mask |= 1n << BigInt(idx);
    }

    const fairnessPenalty = group.reduce((sum, p) => sum + (gameCount.get(p.id) ?? 0) - poolMin, 0);
    const waitPenalty = group.reduce((sum, p) => sum + (waitRank.get(p.id) ?? 0), 0);
    // Convex (streak²) weighting: seating one long-streak player beats seating
    // several streak-1 players, so the search shrinks the largest streaks first.
    // For streak ≤ 1 this equals the count of last-round resters, preserving the
    // no-two-consecutive-rests behaviour exactly.
    const restUrgency = group.reduce((sum, p) => {
      const s = restStreak.get(p.id) ?? 0;
      return sum + s * s;
    }, 0);
    const typePenalty = gameType === 'mixed' ? 0 : gameType === 'male-double' || gameType === 'female-double' ? 1 : 2;
    candidateByKey.set(key, {
      ids,
      mask,
      team1: bestTeams.team1,
      team2: bestTeams.team2,
      gameType,
      restUrgency,
      levelPenalty,
      fairnessPenalty,
      groupRepeatPenalty: latestRoundGroupKeys.has(key) ? 1 : 0,
      typePenalty,
      teamBalancePenalty: bestTeams.balance,
      partnerPenalty: bestTeams.partners,
      opponentPenalty: bestTeams.opponents,
      waitPenalty,
      tieBreak: hashString(key, seed),
    });
  };

  for (const [minLevel, maxLevel] of windows) {
    let players = sorted.filter(p => p.level >= minLevel && p.level <= maxLevel);
    if (minLevel !== maxLevel) {
      players = players.filter(p => p.level === minLevel || p.level === maxLevel);
    }
    players.sort((a, b) => playerRank(a) - playerRank(b));
    if (players.length > MAX_PLAYERS_PER_LEVEL_WINDOW) {
      players = players.slice(0, Math.max(MAX_PLAYERS_PER_LEVEL_WINDOW, courtCount * 8));
    }

    for (let a = 0; a < players.length - 3; a++) {
      for (let b = a + 1; b < players.length - 2; b++) {
        for (let c = b + 1; c < players.length - 1; c++) {
          for (let d = c + 1; d < players.length; d++) {
            addCandidate([players[a]!, players[b]!, players[c]!, players[d]!]);
          }
        }
      }
    }
  }

  const selectCurrentCandidates = (candidateLimit = MAX_COURT_CANDIDATES) =>
    selectBestMatches([...candidateByKey.values()].sort(compareCandidate), pool.length, courtCount, candidateLimit);

  const targetCourtCount = Math.min(courtCount, Math.floor(pool.length / 4));

  // A last-round rester who can only form a wide-level-gap court has no strict
  // candidate covering them. Detect that so we widen the level windows below;
  // otherwise the consecutive-rest guarantee silently fails for isolated levels.
  const coveredIds = new Set<string>();
  for (const c of candidateByKey.values()) {
    for (const id of c.ids) coveredIds.add(id);
  }
  const restedUncovered = [...restedLastRound].some(id => !coveredIds.has(id));
  // Also widen when the fewest-played player(s) cannot be seated within strict
  // level windows — otherwise an isolated level drifts behind on play count.
  const behindUncovered = pool.some(p =>
    !coveredIds.has(p.id) && (gameCount.get(p.id) ?? 0) <= poolMin);

  const strictMatches = selectCurrentCandidates();
  if (strictMatches.length >= targetCourtCount && !restedUncovered && !behindUncovered) return strictMatches;

  let relaxedPlayers = [...sorted].sort((a, b) => playerRank(a) - playerRank(b));
  const relaxedLimit = Math.max(MAX_PLAYERS_PER_LEVEL_WINDOW, courtCount * 8);
  if (relaxedPlayers.length > relaxedLimit) relaxedPlayers = relaxedPlayers.slice(0, relaxedLimit);

  for (let a = 0; a < relaxedPlayers.length - 3; a++) {
    for (let b = a + 1; b < relaxedPlayers.length - 2; b++) {
      for (let c = b + 1; c < relaxedPlayers.length - 1; c++) {
        for (let d = c + 1; d < relaxedPlayers.length; d++) {
          addCandidate([relaxedPlayers[a]!, relaxedPlayers[b]!, relaxedPlayers[c]!, relaxedPlayers[d]!], true);
        }
      }
    }
  }

  return selectCurrentCandidates(Number.MAX_SAFE_INTEGER);
}
