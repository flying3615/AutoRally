import { describe, expect, it } from 'vitest';
import {
  buildNextKnockoutMatches,
  computeTournamentStandings,
  generateKnockoutMatches,
  generateRoundRobinMatches,
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
