import { describe, expect, it } from 'vitest';
import {
  buildNextKnockoutMatches,
  buildTeamMatchGames,
  computeTournamentStandings,
  generateKnockoutMatches,
  generateRoundRobinMatches,
  validateTeamReassignment,
  validateTournamentRegistration,
  type TournamentMatchRecord,
  type TournamentRegistration,
} from '../main/tournament';

function team(id: string, level = 3): TournamentRegistration {
  return {
    id: `reg-${id}`,
    player1Id: id,
    player1Level: level,
    player2Id: null,
    player2Level: null,
  };
}

function ids() {
  let i = 0;
  return () => `m${++i}`;
}

describe('tournament scheduling', () => {
  it('keeps round-robin logical rounds intact when court count is smaller than matches per round', () => {
    const matches = generateRoundRobinMatches('t1', ['a', 'b', 'c', 'd', 'e', 'f'].map(team), 2, ids());
    const rounds = new Map<string, TournamentMatchRecord[]>();
    for (const match of matches) {
      rounds.set(match.round, [...(rounds.get(match.round) ?? []), match]);
    }

    expect(rounds.size).toBe(5);
    for (const roundMatches of rounds.values()) {
      expect(roundMatches).toHaveLength(3);
      const players = roundMatches.flatMap(m => [m.team1Player1Id, m.team2Player1Id]);
      expect(new Set(players).size).toBe(6);
      expect(roundMatches.map(m => m.courtNumber)).toEqual([1, 2, 1]);
    }
  });

  it('uses bracket-sized knockout round names and advances a four-team semifinal directly to final', () => {
    const firstRound = generateKnockoutMatches('t1', ['a', 'b', 'c', 'd'].map(team), ids());
    expect(firstRound.map(m => m.round)).toEqual(['SF', 'SF']);

    const completed = firstRound.map((m, index) => ({
      ...m,
      status: 'completed' as const,
      winner: index === 0 ? 'team1' as const : 'team2' as const,
    }));
    const next = buildNextKnockoutMatches('t1', 'SF', completed, [], ids());

    expect(next).toHaveLength(1);
    expect(next[0]?.round).toBe('F');
    expect(next[0]?.team1Player1Id).toBe('a');
    expect(next[0]?.team2Player1Id).toBe('c');
  });

  it('does not create duplicate or partial next-round knockout matches', () => {
    const firstRound = generateKnockoutMatches('t1', ['a', 'b', 'c', 'd'].map(team), ids());
    const partial = [
      { ...firstRound[0]!, status: 'completed' as const, winner: 'team1' as const },
      firstRound[1]!,
    ];
    expect(buildNextKnockoutMatches('t1', 'SF', partial, [], ids())).toEqual([]);

    const completed = firstRound.map(m => ({ ...m, status: 'completed' as const, winner: 'team1' as const }));
    const existingFinal = buildNextKnockoutMatches('t1', 'SF', completed, [], ids());
    expect(buildNextKnockoutMatches('t1', 'SF', completed, existingFinal, ids())).toEqual([]);
  });

  it('auto-advances odd knockout winners instead of creating a pending self-match', () => {
    const current: TournamentMatchRecord[] = [
      { ...generateKnockoutMatches('t1', ['a', 'b'].map(team), ids())[0]!, id: 'm1', round: 'R1', matchNumber: 1, status: 'completed', winner: 'team1' },
      { ...generateKnockoutMatches('t1', ['c', 'd'].map(team), ids())[0]!, id: 'm2', round: 'R1', matchNumber: 2, status: 'completed', winner: 'team1' },
      {
        id: 'm3',
        tournamentId: 't1',
        round: 'R1',
        matchNumber: 3,
        courtNumber: null,
        status: 'completed',
        team1Player1Id: 'e',
        team1Player2Id: null,
        team2Player1Id: 'e',
        team2Player2Id: null,
        team1Score: null,
        team2Score: null,
        winner: 'team1',
        completedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const next = buildNextKnockoutMatches('t1', 'R1', current, [], ids(), '2026-01-01T00:00:00.000Z');

    expect(next).toHaveLength(2);
    expect(next[0]?.status).toBe('pending');
    expect(next[0]?.team1Player1Id).not.toBe(next[0]?.team2Player1Id);
    expect(next[1]?.status).toBe('completed');
    expect(next[1]?.team1Player1Id).toBe('e');
    expect(next[1]?.team2Player1Id).toBe('e');
  });

  it('excludes bye matches from standings', () => {
    const standings = computeTournamentStandings([
      {
        id: 'bye',
        tournamentId: 't1',
        round: 'QF',
        matchNumber: 1,
        courtNumber: null,
        status: 'completed',
        team1Player1Id: 'a',
        team1Player2Id: null,
        team2Player1Id: 'a',
        team2Player2Id: null,
        team1Score: 1,
        team2Score: 0,
        winner: 'team1',
        completedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'real',
        tournamentId: 't1',
        round: 'QF',
        matchNumber: 2,
        courtNumber: 1,
        status: 'completed',
        team1Player1Id: 'b',
        team1Player2Id: null,
        team2Player1Id: 'c',
        team2Player2Id: null,
        team1Score: 21,
        team2Score: 18,
        winner: 'team1',
        completedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    expect(standings.map(s => s.player1Id)).toEqual(['b', 'c']);
  });

  it('rejects duplicate, self, and already-registered tournament registrations', () => {
    const existing = [
      team('a'),
      { ...team('b'), player2Id: 'c', player2Level: 3 },
    ];

    expect(() => validateTournamentRegistration(existing, 'd', 'd')).toThrow(/same player/i);
    expect(() => validateTournamentRegistration(existing, 'a')).toThrow(/already registered/i);
    expect(() => validateTournamentRegistration(existing, 'd', 'c')).toThrow(/already registered/i);
    expect(validateTournamentRegistration(existing, 'd', 'e')).toBeUndefined();
  });
});

function rosterPlayer(id: string, gender: 'male' | 'female', level: number) {
  return { playerId: id, gender, level };
}

describe('buildTeamMatchGames', () => {
  it('cycles singles picks when the roster is smaller than the requested count', () => {
    const team1 = [rosterPlayer('m1', 'male', 3)];
    const team2 = [rosterPlayer('m2', 'male', 3), rosterPlayer('m3', 'male', 4)];
    const result = buildTeamMatchGames(team1, team2, { ms: 2, ws: 0, md: 0, xd: 0, wd: 0 });

    expect(result.skipped).toEqual([]);
    expect(result.games).toHaveLength(2);
    expect(result.games[0]).toMatchObject({ category: 'MS', slotNumber: 1, team1Player1Id: 'm1', team2Player1Id: 'm2' });
    expect(result.games[1]).toMatchObject({ category: 'MS', slotNumber: 2, team1Player1Id: 'm1', team2Player1Id: 'm3' });
  });

  it('pairs doubles partners by adjacent level after sorting, not roster order', () => {
    const team1 = [rosterPlayer('strong', 'male', 5), rosterPlayer('weak', 'male', 1), rosterPlayer('mid1', 'male', 3), rosterPlayer('mid2', 'male', 3)];
    const team2 = [rosterPlayer('a', 'male', 2), rosterPlayer('b', 'male', 2)];
    const result = buildTeamMatchGames(team1, team2, { ms: 0, ws: 0, md: 2, xd: 0, wd: 0 });

    expect(result.skipped).toEqual([]);
    // Sorted by level: weak(1), mid1(3), mid2(3), strong(5) -> pairs: [weak,mid1], [mid2,strong]
    expect(result.games).toHaveLength(2);
    expect(result.games[0]).toMatchObject({ category: 'MD', slotNumber: 1, team1Player1Id: 'weak', team1Player2Id: 'mid1' });
    expect(result.games[1]).toMatchObject({ category: 'MD', slotNumber: 2, team1Player1Id: 'mid2', team1Player2Id: 'strong' });
  });

  it('pairs mixed doubles by matching rank between the male and female pools', () => {
    const team1 = [
      rosterPlayer('m-low', 'male', 1), rosterPlayer('m-high', 'male', 5),
      rosterPlayer('f-low', 'female', 2), rosterPlayer('f-high', 'female', 4),
    ];
    const team2 = [rosterPlayer('om', 'male', 3), rosterPlayer('of', 'female', 3)];
    const result = buildTeamMatchGames(team1, team2, { ms: 0, ws: 0, md: 0, xd: 2, wd: 0 });

    expect(result.skipped).toEqual([]);
    // Male sorted: m-low(1), m-high(5). Female sorted: f-low(2), f-high(4). Rank-matched pairs: [m-low,f-low], [m-high,f-high]
    expect(result.games[0]).toMatchObject({ category: 'XD', slotNumber: 1, team1Player1Id: 'm-low', team1Player2Id: 'f-low' });
    expect(result.games[1]).toMatchObject({ category: 'XD', slotNumber: 2, team1Player1Id: 'm-high', team1Player2Id: 'f-high' });
  });

  it('skips a category when one team has no eligible players for it', () => {
    const team1 = [rosterPlayer('m1', 'male', 3)]; // no women
    const team2 = [rosterPlayer('f1', 'female', 3), rosterPlayer('m2', 'male', 3)];
    const result = buildTeamMatchGames(team1, team2, { ms: 1, ws: 1, md: 0, xd: 0, wd: 0 });

    expect(result.skipped).toEqual(['WS']);
    expect(result.games).toHaveLength(1);
    expect(result.games[0]!.category).toBe('MS');
  });

  it('skips a doubles category when a team has fewer than 2 eligible players', () => {
    const team1 = [rosterPlayer('m1', 'male', 3)]; // only one man, can't pair
    const team2 = [rosterPlayer('m2', 'male', 3), rosterPlayer('m3', 'male', 4)];
    const result = buildTeamMatchGames(team1, team2, { ms: 0, ws: 0, md: 1, xd: 0, wd: 0 });

    expect(result.skipped).toEqual(['MD']);
    expect(result.games).toHaveLength(0);
  });

  it('does not generate or skip a category whose count is 0', () => {
    const team1 = [rosterPlayer('m1', 'male', 3)];
    const team2 = [rosterPlayer('m2', 'male', 3)];
    const result = buildTeamMatchGames(team1, team2, { ms: 0, ws: 0, md: 0, xd: 0, wd: 0 });

    expect(result.games).toEqual([]);
    expect(result.skipped).toEqual([]);
  });
});

describe('validateTeamReassignment', () => {
  const team1 = [rosterPlayer('t1-m1', 'male', 3), rosterPlayer('t1-m2', 'male', 4), rosterPlayer('t1-f1', 'female', 3)];
  const team2 = [rosterPlayer('t2-m1', 'male', 3), rosterPlayer('t2-f1', 'female', 3), rosterPlayer('t2-f2', 'female', 4)];

  it('accepts a valid singles reassignment', () => {
    expect(() => validateTeamReassignment('MS', team1, team2, {
      team1Player1Id: 't1-m2', team1Player2Id: null, team2Player1Id: 't2-m1', team2Player2Id: null,
    })).not.toThrow();
  });

  it('rejects a singles category given a second player', () => {
    expect(() => validateTeamReassignment('MS', team1, team2, {
      team1Player1Id: 't1-m1', team1Player2Id: 't1-m2', team2Player1Id: 't2-m1', team2Player2Id: null,
    })).toThrow('singles category');
  });

  it('rejects a doubles category missing a second player', () => {
    expect(() => validateTeamReassignment('MD', team1, team2, {
      team1Player1Id: 't1-m1', team1Player2Id: null, team2Player1Id: 't2-m1', team2Player2Id: null,
    })).toThrow('requires two players');
  });

  it('rejects a player not on the roster for that side', () => {
    expect(() => validateTeamReassignment('MS', team1, team2, {
      team1Player1Id: 'not-on-any-team', team1Player2Id: null, team2Player1Id: 't2-m1', team2Player2Id: null,
    })).toThrow('not on this team');
  });

  it('rejects a gender mismatch for the category', () => {
    expect(() => validateTeamReassignment('MS', team1, team2, {
      team1Player1Id: 't1-f1', team1Player2Id: null, team2Player1Id: 't2-m1', team2Player2Id: null,
    })).toThrow('requires a male player');
  });

  it('rejects a mixed-doubles pair with two players of the same gender', () => {
    expect(() => validateTeamReassignment('XD', team1, team2, {
      team1Player1Id: 't1-m1', team1Player2Id: 't1-m2', team2Player1Id: 't2-m1', team2Player2Id: 't2-f1',
    })).toThrow('requires a female player');
  });

  it('accepts a valid mixed-doubles reassignment', () => {
    expect(() => validateTeamReassignment('XD', team1, team2, {
      team1Player1Id: 't1-m1', team1Player2Id: 't1-f1', team2Player1Id: 't2-m1', team2Player2Id: 't2-f1',
    })).not.toThrow();
  });
});
