export interface TournamentRegistration {
  id: string;
  player1Id: string;
  player1Level: number;
  player2Id: string | null;
  player2Level: number | null;
}

export interface TournamentMatchRecord {
  id: string;
  tournamentId: string;
  round: string;
  matchNumber: number;
  courtNumber: number | null;
  status: 'pending' | 'in_progress' | 'completed';
  team1Player1Id: string;
  team1Player2Id: string | null;
  team2Player1Id: string;
  team2Player2Id: string | null;
  team1Score: number | null;
  team2Score: number | null;
  set1Team1Score?: number | null;
  set1Team2Score?: number | null;
  set2Team1Score?: number | null;
  set2Team2Score?: number | null;
  set3Team1Score?: number | null;
  set3Team2Score?: number | null;
  winner: 'team1' | 'team2' | null;
  completedAt: string | null;
}

export interface TournamentStanding {
  player1Id: string;
  player2Id: string | null;
  played: number;
  wins: number;
  losses: number;
  pf: number;
  pa: number;
  setsWon: number;
  setsLost: number;
}

type IdFactory = () => string;

interface TeamRef {
  player1Id: string;
  player2Id: string | null;
}

function avgLevel(reg: TournamentRegistration): number {
  return reg.player2Id ? (reg.player1Level + (reg.player2Level ?? reg.player1Level)) / 2 : reg.player1Level;
}

function nextPowerOfTwo(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

export function knockoutRoundName(entrantCount: number): string {
  if (entrantCount <= 2) return 'F';
  if (entrantCount === 4) return 'SF';
  if (entrantCount === 8) return 'QF';
  return `R${entrantCount}`;
}

function sameTeam(
  a1: string,
  a2: string | null,
  b1: string,
  b2: string | null,
): boolean {
  return a1 === b1 && (a2 ?? null) === (b2 ?? null);
}

function teamKey(player1Id: string, player2Id: string | null): string {
  return `${player1Id}|${player2Id ?? ''}`;
}

export type MatchKind = 'rubber' | 'group' | 'bracket';

export function matchKind(row: { teamMatchId: string | null; groupId: string | null }): MatchKind {
  if (row.teamMatchId) return 'rubber';
  if (row.groupId) return 'group';
  return 'bracket';
}

function pendingMatch(
  id: string,
  tournamentId: string,
  round: string,
  matchNumber: number,
  team1: TeamRef,
  team2: TeamRef,
  courtNumber: number | null = null,
): TournamentMatchRecord {
  return {
    id,
    tournamentId,
    round,
    matchNumber,
    courtNumber,
    status: 'pending',
    team1Player1Id: team1.player1Id,
    team1Player2Id: team1.player2Id,
    team2Player1Id: team2.player1Id,
    team2Player2Id: team2.player2Id,
    team1Score: null,
    team2Score: null,
    winner: null,
    completedAt: null,
  };
}

function byeMatch(
  id: string,
  tournamentId: string,
  round: string,
  matchNumber: number,
  team: TeamRef,
  completedAt: string,
): TournamentMatchRecord {
  return {
    id,
    tournamentId,
    round,
    matchNumber,
    courtNumber: null,
    status: 'completed',
    team1Player1Id: team.player1Id,
    team1Player2Id: team.player2Id,
    team2Player1Id: team.player1Id,
    team2Player2Id: team.player2Id,
    team1Score: null,
    team2Score: null,
    winner: 'team1',
    completedAt,
  };
}

export function generateKnockoutMatches(
  tournamentId: string,
  registrations: TournamentRegistration[],
  makeId: IdFactory,
  completedAt = new Date().toISOString(),
): TournamentMatchRecord[] {
  const seeded = [...registrations].sort((a, b) => avgLevel(b) - avgLevel(a));
  const targetSize = nextPowerOfTwo(seeded.length);
  const round = knockoutRoundName(targetSize);
  const matches: TournamentMatchRecord[] = [];

  for (let i = 0; i < targetSize / 2; i++) {
    const a = seeded[i] ?? null;
    const b = seeded[targetSize - 1 - i] ?? null;
    if (!a) continue;

    const teamA = { player1Id: a.player1Id, player2Id: a.player2Id ?? null };
    if (!b) {
      matches.push(byeMatch(makeId(), tournamentId, round, i + 1, teamA, completedAt));
      continue;
    }

    const teamB = { player1Id: b.player1Id, player2Id: b.player2Id ?? null };
    matches.push(pendingMatch(makeId(), tournamentId, round, i + 1, teamA, teamB));
  }

  return matches;
}

export function roundRobinMatchCount(participantCount: number): number {
  return (participantCount * (participantCount - 1)) / 2;
}

export function generateRoundRobinMatches(
  tournamentId: string,
  registrations: TournamentRegistration[],
  courtCount: number,
  makeId: IdFactory,
  startMatchNumber = 1,
  startCourtIndex = 0,
): TournamentMatchRecord[] {
  const participants = registrations.map((_, index) => index);
  if (participants.length % 2 === 1) participants.push(-1);

  const matches: TournamentMatchRecord[] = [];
  let matchNumber = startMatchNumber;
  const courts = Math.max(1, Math.floor(courtCount) || 1);

  for (let roundIndex = 0; roundIndex < participants.length - 1; roundIndex++) {
    let matchInRound = 0;
    for (let i = 0; i < participants.length / 2; i++) {
      const a = participants[i]!;
      const b = participants[participants.length - 1 - i]!;
      if (a === -1 || b === -1) continue;

      const teamA = registrations[a]!;
      const teamB = registrations[b]!;
      matches.push(pendingMatch(
        makeId(),
        tournamentId,
        `R${roundIndex + 1}`,
        matchNumber,
        { player1Id: teamA.player1Id, player2Id: teamA.player2Id ?? null },
        { player1Id: teamB.player1Id, player2Id: teamB.player2Id ?? null },
        ((startCourtIndex + matchInRound) % courts) + 1,
      ));
      matchNumber++;
      matchInRound++;
    }

    participants.splice(1, 0, participants.pop()!);
  }

  return matches;
}

export interface TournamentGroup {
  id: string;
  name: string;
}

export function assignRegistrationsToGroups(
  registrations: TournamentRegistration[],
  groups: TournamentGroup[],
): Map<string, TournamentRegistration[]> {
  const seeded = [...registrations].sort((a, b) => avgLevel(a) - avgLevel(b));
  const byGroup = new Map<string, TournamentRegistration[]>(groups.map(g => [g.id, []]));
  let dir = 1;
  let idx = 0;
  for (const reg of seeded) {
    byGroup.get(groups[idx]!.id)!.push(reg);
    if (idx === groups.length - 1 && dir === 1) dir = -1;
    else if (idx === 0 && dir === -1) dir = 1;
    else idx += dir;
  }
  return byGroup;
}

export interface GroupStanding extends TournamentStanding {
  groupId: string;
}

export function buildFirstKnockoutRound(
  tournamentId: string,
  groupsInOrder: TournamentGroup[],
  qualifiersByGroup: Map<string, GroupStanding[]>,
  advancePerGroup: 1 | 2,
  makeId: IdFactory,
): TournamentMatchRecord[] {
  const winners = groupsInOrder.map(g => qualifiersByGroup.get(g.id)![0]!);

  if (advancePerGroup === 1) {
    const round = knockoutRoundName(winners.length);
    const matches: TournamentMatchRecord[] = [];
    for (let i = 0; i < winners.length / 2; i++) {
      const a = winners[i]!;
      const b = winners[winners.length - 1 - i]!;
      matches.push(pendingMatch(makeId(), tournamentId, round, i + 1,
        { player1Id: a.player1Id, player2Id: a.player2Id },
        { player1Id: b.player1Id, player2Id: b.player2Id }));
    }
    return matches;
  }

  const runnersUp = groupsInOrder.map(g => qualifiersByGroup.get(g.id)![1]!);
  const shifted = [...runnersUp.slice(1), runnersUp[0]!];
  const round = knockoutRoundName(winners.length * 2);
  return winners.map((w, i) => pendingMatch(makeId(), tournamentId, round, i + 1,
    { player1Id: w.player1Id, player2Id: w.player2Id },
    { player1Id: shifted[i]!.player1Id, player2Id: shifted[i]!.player2Id }));
}

export function validateGroupReassignment(
  currentGroupMatches: TournamentMatchRecord[],
  targetGroupMatches: TournamentMatchRecord[],
): void {
  if (currentGroupMatches.some(m => m.status !== 'pending')) {
    throw new Error('This registration\'s group has already started — cannot move them out');
  }
  if (targetGroupMatches.some(m => m.status !== 'pending')) {
    throw new Error('The target group has already started — cannot move them in');
  }
}

function isPowerOfTwo(n: number): boolean {
  return n >= 2 && (n & (n - 1)) === 0;
}

export function validateGroupTournamentConfig(
  format: string,
  groupCount: number | undefined,
  advancePerGroup: number | undefined,
): void {
  if (format !== 'mixed') return;
  if (!groupCount || !Number.isInteger(groupCount) || groupCount < 2) throw new Error('Group count must be a whole number of at least 2');
  if (groupCount > 26) throw new Error('Group count cannot exceed 26');
  if (advancePerGroup !== 1 && advancePerGroup !== 2) throw new Error('Advance-per-group must be 1 or 2');
  if (!isPowerOfTwo(groupCount * advancePerGroup)) {
    throw new Error('Group count × advance-per-group must be a power of two (2, 4, 8, 16...)');
  }
}

function winningTeam(match: TournamentMatchRecord): TeamRef | null {
  if (match.status !== 'completed' || !match.winner) return null;
  if (match.winner === 'team1') {
    return { player1Id: match.team1Player1Id, player2Id: match.team1Player2Id };
  }
  return { player1Id: match.team2Player1Id, player2Id: match.team2Player2Id };
}

export function buildNextKnockoutMatches(
  tournamentId: string,
  currentRound: string,
  currentRoundMatches: TournamentMatchRecord[],
  existingNextRoundMatches: TournamentMatchRecord[],
  makeId: IdFactory,
  completedAt = new Date().toISOString(),
): TournamentMatchRecord[] {
  const relevant = currentRoundMatches
    .filter(match => match.tournamentId === tournamentId && match.round === currentRound)
    .sort((a, b) => a.matchNumber - b.matchNumber);
  if (relevant.length === 0) return [];

  const winners = relevant.map(winningTeam);
  if (winners.some(winner => winner === null)) return [];

  const nextTeams = winners.filter((winner): winner is TeamRef => winner !== null);
  if (nextTeams.length <= 1) return [];

  const nextRound = knockoutRoundName(nextTeams.length);
  if (existingNextRoundMatches.some(match => match.tournamentId === tournamentId && match.round === nextRound)) {
    return [];
  }

  const nextMatches: TournamentMatchRecord[] = [];
  for (let i = 0; i < nextTeams.length; i += 2) {
    const team1 = nextTeams[i]!;
    const team2 = nextTeams[i + 1];
    const matchNumber = Math.floor(i / 2) + 1;
    if (!team2) {
      nextMatches.push(byeMatch(makeId(), tournamentId, nextRound, matchNumber, team1, completedAt));
      continue;
    }
    nextMatches.push(pendingMatch(makeId(), tournamentId, nextRound, matchNumber, team1, team2));
  }

  return nextMatches;
}

// Standings tiebreakers use actual badminton points scored, not sets won.
// Falls back to team1Score/team2Score (pre-set-scoring legacy matches, where
// those fields held raw points) when no per-set breakdown is recorded.
function matchPointDifferential(match: TournamentMatchRecord): { sc1: number; sc2: number } {
  const setPairs: [number | null | undefined, number | null | undefined][] = [
    [match.set1Team1Score, match.set1Team2Score],
    [match.set2Team1Score, match.set2Team2Score],
    [match.set3Team1Score, match.set3Team2Score],
  ];
  const playedSets = setPairs.filter((pair): pair is [number, number] => pair[0] != null && pair[1] != null);
  if (playedSets.length === 0) {
    return { sc1: match.team1Score ?? 0, sc2: match.team2Score ?? 0 };
  }
  return playedSets.reduce(
    (acc, [a, b]) => ({ sc1: acc.sc1 + a, sc2: acc.sc2 + b }),
    { sc1: 0, sc2: 0 },
  );
}

// Legacy matches (no per-set breakdown) are treated as a single set decided by
// the match winner, so older tournaments still get a sensible sets record.
function matchSetsWon(match: TournamentMatchRecord): { s1: number; s2: number } {
  const setPairs: [number | null | undefined, number | null | undefined][] = [
    [match.set1Team1Score, match.set1Team2Score],
    [match.set2Team1Score, match.set2Team2Score],
    [match.set3Team1Score, match.set3Team2Score],
  ];
  const playedSets = setPairs.filter((pair): pair is [number, number] => pair[0] != null && pair[1] != null);
  if (playedSets.length === 0) {
    return match.winner === 'team1' ? { s1: 1, s2: 0 } : { s1: 0, s2: 1 };
  }
  return playedSets.reduce(
    (acc, [a, b]) => a > b ? { s1: acc.s1 + 1, s2: acc.s2 } : { s1: acc.s1, s2: acc.s2 + 1 },
    { s1: 0, s2: 0 },
  );
}

export function computeTournamentStandings(matches: TournamentMatchRecord[]): TournamentStanding[] {
  const standings = new Map<string, TournamentStanding>();

  for (const match of matches) {
    if (match.status !== 'completed') continue;
    if (sameTeam(match.team1Player1Id, match.team1Player2Id, match.team2Player1Id, match.team2Player2Id)) {
      continue;
    }

    const t1k = teamKey(match.team1Player1Id, match.team1Player2Id);
    const t2k = teamKey(match.team2Player1Id, match.team2Player2Id);
    if (!standings.has(t1k)) {
      standings.set(t1k, { player1Id: match.team1Player1Id, player2Id: match.team1Player2Id, played: 0, wins: 0, losses: 0, pf: 0, pa: 0, setsWon: 0, setsLost: 0 });
    }
    if (!standings.has(t2k)) {
      standings.set(t2k, { player1Id: match.team2Player1Id, player2Id: match.team2Player2Id, played: 0, wins: 0, losses: 0, pf: 0, pa: 0, setsWon: 0, setsLost: 0 });
    }

    const s1 = standings.get(t1k)!;
    const s2 = standings.get(t2k)!;
    const { sc1, sc2 } = matchPointDifferential(match);
    const { s1: sets1, s2: sets2 } = matchSetsWon(match);
    s1.played++;
    s2.played++;
    s1.pf += sc1;
    s1.pa += sc2;
    s2.pf += sc2;
    s2.pa += sc1;
    s1.setsWon += sets1;
    s1.setsLost += sets2;
    s2.setsWon += sets2;
    s2.setsLost += sets1;
    if (match.winner === 'team1') {
      s1.wins++;
      s2.losses++;
    } else if (match.winner === 'team2') {
      s2.wins++;
      s1.losses++;
    }
  }

  return [...standings.values()].sort((a, b) =>
    b.wins - a.wins
    || (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost)
    || (b.pf - b.pa) - (a.pf - a.pa)
  );
}

export function validateTournamentRegistration(
  existingRegistrations: TournamentRegistration[],
  player1Id: string,
  player2Id?: string | null,
): void {
  if (player2Id && player1Id === player2Id) {
    throw new Error('Cannot register the same player twice');
  }

  const existingPlayerIds = new Set<string>();
  for (const registration of existingRegistrations) {
    existingPlayerIds.add(registration.player1Id);
    if (registration.player2Id) existingPlayerIds.add(registration.player2Id);
  }

  if (existingPlayerIds.has(player1Id) || (player2Id && existingPlayerIds.has(player2Id))) {
    throw new Error('Player is already registered in this tournament');
  }
}

export interface MatchReassignmentInput {
  team1RegistrationId: string;
  team2RegistrationId: string;
}

export interface MatchReassignmentUpdate {
  matchId: string;
  team1Player1Id: string;
  team1Player2Id: string | null;
  team2Player1Id: string;
  team2Player2Id: string | null;
}

type ReassignmentSide = 'team1' | 'team2';

// A round-robin round schedules every registration into some pending match (no
// one is "free"), so picking a new occupant for a slot always means trading
// places with whoever currently holds it, not moving in an idle team. Each
// side is resolved against the round's original state (not the other side's
// result), so a same-match team1/team2 relabel and a genuine cross-match swap
// both fall out of the same logic without special-casing either.
export function validateMatchReassignment(
  targetMatchId: string,
  targetStatus: TournamentMatchRecord['status'],
  targetIsBye: boolean,
  registrations: TournamentRegistration[],
  roundMatches: TournamentMatchRecord[],
  assignment: MatchReassignmentInput,
): MatchReassignmentUpdate[] {
  if (targetStatus !== 'pending') throw new Error('Cannot reassign a match that has already started');
  if (targetIsBye) throw new Error('Cannot reassign a bye match');
  if (assignment.team1RegistrationId === assignment.team2RegistrationId) {
    throw new Error('Team 1 and Team 2 must be different registrations');
  }

  const regById = new Map(registrations.map(r => [r.id, r]));
  const reg1 = regById.get(assignment.team1RegistrationId);
  const reg2 = regById.get(assignment.team2RegistrationId);
  if (!reg1 || !reg2) throw new Error('Selected team is not registered for this tournament');

  const pending = roundMatches.filter(m => m.status === 'pending');
  if (!pending.some(m => m.id === targetMatchId)) throw new Error('Match not found in this round');

  const slotKey = (m: TournamentMatchRecord, side: ReassignmentSide) =>
    side === 'team1' ? teamKey(m.team1Player1Id, m.team1Player2Id) : teamKey(m.team2Player1Id, m.team2Player2Id);

  const working = new Map(pending.map(m => [m.id, { team1: slotKey(m, 'team1'), team2: slotKey(m, 'team2') }]));

  // Searches the current (possibly already-mutated) working state, not the
  // original match records — the second swapIn call must see where the first
  // call just relocated a team, or it can overwrite a slot that team was
  // already moved out of and lose it.
  const findSlot = (key: string): { matchId: string; side: ReassignmentSide } | null => {
    for (const [matchId, slots] of working) {
      if (slots.team1 === key) return { matchId, side: 'team1' };
      if (slots.team2 === key) return { matchId, side: 'team2' };
    }
    return null;
  };

  const swapIn = (side: ReassignmentSide, desired: TournamentRegistration) => {
    const desiredKey = teamKey(desired.player1Id, desired.player2Id ?? null);
    const targetSlots = working.get(targetMatchId)!;
    if (desiredKey === targetSlots[side]) return; // already seated here

    const source = findSlot(desiredKey);
    if (!source) throw new Error('Selected team is not currently scheduled in a pending match this round');

    const displaced = targetSlots[side];
    targetSlots[side] = desiredKey;
    working.get(source.matchId)![source.side] = displaced;
  };

  swapIn('team1', reg1);
  swapIn('team2', reg2);

  const regByKey = new Map(registrations.map(r => [teamKey(r.player1Id, r.player2Id ?? null), r]));
  const resolve = (key: string) => {
    const reg = regByKey.get(key);
    if (!reg) throw new Error('Internal error: could not resolve team after reassignment');
    return { player1Id: reg.player1Id, player2Id: reg.player2Id ?? null };
  };

  const updates: MatchReassignmentUpdate[] = [];
  for (const m of pending) {
    const before = { team1: slotKey(m, 'team1'), team2: slotKey(m, 'team2') };
    const after = working.get(m.id)!;
    if (after.team1 === before.team1 && after.team2 === before.team2) continue;
    const t1 = resolve(after.team1);
    const t2 = resolve(after.team2);
    updates.push({
      matchId: m.id,
      team1Player1Id: t1.player1Id,
      team1Player2Id: t1.player2Id,
      team2Player1Id: t2.player1Id,
      team2Player2Id: t2.player2Id,
    });
  }
  return updates;
}

// Knockout has no "neither team advances" state — every pending match must
// resolve to a winner for the bracket to progress, so deletion is limited to
// round-robin, where a round already tolerates a team sitting out.
export function validateMatchDeletion(
  tournamentFormat: string,
  matchStatus: TournamentMatchRecord['status'],
  isTeamMatchRubber: boolean,
): void {
  if (isTeamMatchRubber) throw new Error('Not a bracket match');
  if (tournamentFormat !== 'round_robin') throw new Error('Deleting a match is only supported for round-robin tournaments');
  if (matchStatus !== 'pending') throw new Error('Cannot delete a match that has already started');
}

export interface TeamMatchComposition {
  ms: number;
  ws: number;
  md: number;
  xd: number;
  wd: number;
}

export interface TeamRosterPlayer {
  playerId: string;
  gender: 'male' | 'female';
  level: number;
}

export type TeamMatchCategory = 'MS' | 'WS' | 'MD' | 'XD' | 'WD';

export interface TeamMatchGameSpec {
  category: TeamMatchCategory;
  slotNumber: number;
  team1Player1Id: string;
  team1Player2Id: string | null;
  team2Player1Id: string;
  team2Player2Id: string | null;
}

export interface BuildTeamMatchGamesResult {
  games: TeamMatchGameSpec[];
  skipped: TeamMatchCategory[];
}

function byGender(roster: TeamRosterPlayer[], gender: 'male' | 'female'): TeamRosterPlayer[] {
  return roster.filter(p => p.gender === gender);
}

function pickCycled(pool: TeamRosterPlayer[], count: number): string[] {
  if (pool.length === 0) return [];
  return Array.from({ length: count }, (_, i) => pool[i % pool.length]!.playerId);
}

function pairAdjacentByLevel(pool: TeamRosterPlayer[], count: number): Array<[string, string]> {
  if (pool.length < 2) return [];
  const sorted = [...pool].sort((a, b) => b.level - a.level);
  const n = sorted.length;
  return Array.from({ length: count }, (_, i) => {
    const idxA = (2 * i) % n;
    const idxB = (2 * i + 1) % n;
    return [sorted[idxA]!.playerId, sorted[idxB]!.playerId] as [string, string];
  });
}

function pairMixedByLevel(malePool: TeamRosterPlayer[], femalePool: TeamRosterPlayer[], count: number): Array<[string, string]> {
  if (malePool.length === 0 || femalePool.length === 0) return [];
  const sortedMale = [...malePool].sort((a, b) => b.level - a.level);
  const sortedFemale = [...femalePool].sort((a, b) => b.level - a.level);
  return Array.from({ length: count }, (_, i) => [
    sortedMale[i % sortedMale.length]!.playerId,
    sortedFemale[i % sortedFemale.length]!.playerId,
  ] as [string, string]);
}

export function buildTeamMatchGames(
  team1Roster: TeamRosterPlayer[],
  team2Roster: TeamRosterPlayer[],
  composition: TeamMatchComposition,
): BuildTeamMatchGamesResult {
  const games: TeamMatchGameSpec[] = [];
  const skipped: TeamMatchCategory[] = [];

  const singlesSpecs: Array<{ category: TeamMatchCategory; gender: 'male' | 'female'; count: number }> = [
    { category: 'MS', gender: 'male', count: composition.ms },
    { category: 'WS', gender: 'female', count: composition.ws },
  ];
  for (const spec of singlesSpecs) {
    if (spec.count <= 0) continue;
    const pool1 = byGender(team1Roster, spec.gender);
    const pool2 = byGender(team2Roster, spec.gender);
    if (pool1.length === 0 || pool2.length === 0) { skipped.push(spec.category); continue; }
    const picks1 = pickCycled(pool1, spec.count);
    const picks2 = pickCycled(pool2, spec.count);
    for (let i = 0; i < spec.count; i++) {
      games.push({
        category: spec.category,
        slotNumber: i + 1,
        team1Player1Id: picks1[i]!,
        team1Player2Id: null,
        team2Player1Id: picks2[i]!,
        team2Player2Id: null,
      });
    }
  }

  const doublesSpecs: Array<{ category: TeamMatchCategory; gender: 'male' | 'female'; count: number }> = [
    { category: 'MD', gender: 'male', count: composition.md },
    { category: 'WD', gender: 'female', count: composition.wd },
  ];
  for (const spec of doublesSpecs) {
    if (spec.count <= 0) continue;
    const pool1 = byGender(team1Roster, spec.gender);
    const pool2 = byGender(team2Roster, spec.gender);
    const pairs1 = pairAdjacentByLevel(pool1, spec.count);
    const pairs2 = pairAdjacentByLevel(pool2, spec.count);
    if (pairs1.length === 0 || pairs2.length === 0) { skipped.push(spec.category); continue; }
    for (let i = 0; i < spec.count; i++) {
      games.push({
        category: spec.category,
        slotNumber: i + 1,
        team1Player1Id: pairs1[i]![0],
        team1Player2Id: pairs1[i]![1],
        team2Player1Id: pairs2[i]![0],
        team2Player2Id: pairs2[i]![1],
      });
    }
  }

  if (composition.xd > 0) {
    const male1 = byGender(team1Roster, 'male');
    const female1 = byGender(team1Roster, 'female');
    const male2 = byGender(team2Roster, 'male');
    const female2 = byGender(team2Roster, 'female');
    const pairs1 = pairMixedByLevel(male1, female1, composition.xd);
    const pairs2 = pairMixedByLevel(male2, female2, composition.xd);
    if (pairs1.length === 0 || pairs2.length === 0) {
      skipped.push('XD');
    } else {
      for (let i = 0; i < composition.xd; i++) {
        games.push({
          category: 'XD',
          slotNumber: i + 1,
          team1Player1Id: pairs1[i]![0],
          team1Player2Id: pairs1[i]![1],
          team2Player1Id: pairs2[i]![0],
          team2Player2Id: pairs2[i]![1],
        });
      }
    }
  }

  return { games, skipped };
}

export interface TeamReassignmentInput {
  team1Player1Id: string;
  team1Player2Id: string | null;
  team2Player1Id: string;
  team2Player2Id: string | null;
}

export function validateTeamReassignment(
  category: TeamMatchCategory,
  team1Roster: TeamRosterPlayer[],
  team2Roster: TeamRosterPlayer[],
  assignment: TeamReassignmentInput,
): void {
  const needsDoubles = category === 'MD' || category === 'WD' || category === 'XD';
  if (needsDoubles) {
    if (!assignment.team1Player2Id || !assignment.team2Player2Id) throw new Error(`${category} requires two players per side`);
    if (assignment.team1Player1Id === assignment.team1Player2Id) throw new Error('Team 1 pair must be two different players');
    if (assignment.team2Player1Id === assignment.team2Player2Id) throw new Error('Team 2 pair must be two different players');
  } else if (assignment.team1Player2Id || assignment.team2Player2Id) {
    throw new Error(`${category} is a singles category and cannot have a second player`);
  }

  const findPlayer = (roster: TeamRosterPlayer[], playerId: string) => roster.find(p => p.playerId === playerId);

  const checkSlot = (roster: TeamRosterPlayer[], playerId: string, requiredGender: 'male' | 'female') => {
    const player = findPlayer(roster, playerId);
    if (!player) throw new Error('Selected player is not on this team');
    if (player.gender !== requiredGender) throw new Error(`${category} requires a ${requiredGender} player in this slot`);
  };

  if (category === 'MS' || category === 'MD') {
    checkSlot(team1Roster, assignment.team1Player1Id, 'male');
    checkSlot(team2Roster, assignment.team2Player1Id, 'male');
    if (assignment.team1Player2Id) checkSlot(team1Roster, assignment.team1Player2Id, 'male');
    if (assignment.team2Player2Id) checkSlot(team2Roster, assignment.team2Player2Id, 'male');
  } else if (category === 'WS' || category === 'WD') {
    checkSlot(team1Roster, assignment.team1Player1Id, 'female');
    checkSlot(team2Roster, assignment.team2Player1Id, 'female');
    if (assignment.team1Player2Id) checkSlot(team1Roster, assignment.team1Player2Id, 'female');
    if (assignment.team2Player2Id) checkSlot(team2Roster, assignment.team2Player2Id, 'female');
  } else if (category === 'XD') {
    checkSlot(team1Roster, assignment.team1Player1Id, 'male');
    checkSlot(team2Roster, assignment.team2Player1Id, 'male');
    checkSlot(team1Roster, assignment.team1Player2Id!, 'female');
    checkSlot(team2Roster, assignment.team2Player2Id!, 'female');
  }
}
