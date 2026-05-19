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

function knockoutRoundName(entrantCount: number): string {
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
  const seeded = [...registrations].sort((a, b) => avgLevel(a) - avgLevel(b));
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

export function generateRoundRobinMatches(
  tournamentId: string,
  registrations: TournamentRegistration[],
  courtCount: number,
  makeId: IdFactory,
): TournamentMatchRecord[] {
  const participants = registrations.map((_, index) => index);
  if (participants.length % 2 === 1) participants.push(-1);

  const matches: TournamentMatchRecord[] = [];
  let matchNumber = 1;
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
        (matchInRound % courts) + 1,
      ));
      matchNumber++;
      matchInRound++;
    }

    participants.splice(1, 0, participants.pop()!);
  }

  return matches;
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
      standings.set(t1k, { player1Id: match.team1Player1Id, player2Id: match.team1Player2Id, played: 0, wins: 0, losses: 0, pf: 0, pa: 0 });
    }
    if (!standings.has(t2k)) {
      standings.set(t2k, { player1Id: match.team2Player1Id, player2Id: match.team2Player2Id, played: 0, wins: 0, losses: 0, pf: 0, pa: 0 });
    }

    const s1 = standings.get(t1k)!;
    const s2 = standings.get(t2k)!;
    const sc1 = match.team1Score ?? 0;
    const sc2 = match.team2Score ?? 0;
    s1.played++;
    s2.played++;
    s1.pf += sc1;
    s1.pa += sc2;
    s2.pf += sc2;
    s2.pa += sc1;
    if (match.winner === 'team1') {
      s1.wins++;
      s2.losses++;
    } else if (match.winner === 'team2') {
      s2.wins++;
      s1.losses++;
    }
  }

  return [...standings.values()].sort((a, b) => b.wins - a.wins || (b.pf - b.pa) - (a.pf - a.pa));
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
