import { beforeEach, describe, expect, it } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';
import { clearHistoricalData } from '../main/historyCleanup';

let db: Database;

function count(table: string): number {
  return db.exec(`SELECT COUNT(*) AS count FROM ${table}`)[0]!.values[0]![0] as number;
}

function countWhere(table: string, condition: string): number {
  return db.exec(`SELECT COUNT(*) AS count FROM ${table} WHERE ${condition}`)[0]!.values[0]![0] as number;
}

function setupSchema() {
  db.run('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE players (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE balances (id TEXT PRIMARY KEY, playerId TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE, balance REAL NOT NULL);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE upcoming_sessions (id TEXT PRIMARY KEY, date TEXT NOT NULL);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('active', 'completed')));
    CREATE TABLE attendance (id TEXT PRIMARY KEY, playerId TEXT NOT NULL REFERENCES players(id), sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE);
    CREATE TABLE games (id TEXT PRIMARY KEY, sessionId TEXT NOT NULL REFERENCES sessions(id), playerId TEXT NOT NULL REFERENCES players(id));
    CREATE TABLE payments (id TEXT PRIMARY KEY, playerId TEXT NOT NULL REFERENCES players(id), sessionId TEXT REFERENCES sessions(id), paymentType TEXT NOT NULL);
    CREATE TABLE tournaments (id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('upcoming', 'active', 'completed')));
    CREATE TABLE tournament_registrations (id TEXT PRIMARY KEY, tournamentId TEXT NOT NULL REFERENCES tournaments(id), playerId TEXT NOT NULL REFERENCES players(id));
    CREATE TABLE tournament_standings (id TEXT PRIMARY KEY, tournamentId TEXT NOT NULL REFERENCES tournaments(id), playerId TEXT NOT NULL REFERENCES players(id));
    CREATE TABLE tournament_teams (id TEXT PRIMARY KEY, tournamentId TEXT NOT NULL REFERENCES tournaments(id));
    CREATE TABLE tournament_team_players (id TEXT PRIMARY KEY, teamId TEXT NOT NULL REFERENCES tournament_teams(id), playerId TEXT NOT NULL REFERENCES players(id));
    CREATE TABLE tournament_team_matches (id TEXT PRIMARY KEY, tournamentId TEXT NOT NULL REFERENCES tournaments(id), team1Id TEXT NOT NULL REFERENCES tournament_teams(id), team2Id TEXT NOT NULL REFERENCES tournament_teams(id));
    CREATE TABLE tournament_matches (id TEXT PRIMARY KEY, tournamentId TEXT NOT NULL REFERENCES tournaments(id), teamMatchId TEXT REFERENCES tournament_team_matches(id), playerId TEXT NOT NULL REFERENCES players(id));
  `);
}

function seedCleanupData() {
  db.exec(`
    INSERT INTO players VALUES ('player-1', 'Player One');
    INSERT INTO balances VALUES ('balance-1', 'player-1', 50);
    INSERT INTO settings VALUES ('courtCount', '4');
    INSERT INTO upcoming_sessions VALUES ('upcoming-1', '2026-07-27');

    INSERT INTO sessions VALUES ('session-active', 'active');
    INSERT INTO sessions VALUES ('session-completed', 'completed');
    INSERT INTO attendance VALUES ('attendance-active', 'player-1', 'session-active');
    INSERT INTO attendance VALUES ('attendance-completed', 'player-1', 'session-completed');
    INSERT INTO games VALUES ('game-active', 'session-active', 'player-1');
    INSERT INTO games VALUES ('game-completed', 'session-completed', 'player-1');
    INSERT INTO payments VALUES ('payment-active', 'player-1', 'session-active', 'session');
    INSERT INTO payments VALUES ('payment-completed', 'player-1', 'session-completed', 'session');
    INSERT INTO payments VALUES ('payment-topup', 'player-1', NULL, 'topup');

    INSERT INTO tournaments VALUES ('tournament-active', 'active');
    INSERT INTO tournaments VALUES ('tournament-completed', 'completed');
    INSERT INTO tournament_registrations VALUES ('registration-active', 'tournament-active', 'player-1');
    INSERT INTO tournament_registrations VALUES ('registration-completed', 'tournament-completed', 'player-1');
    INSERT INTO tournament_standings VALUES ('standing-active', 'tournament-active', 'player-1');
    INSERT INTO tournament_standings VALUES ('standing-completed', 'tournament-completed', 'player-1');
    INSERT INTO tournament_teams VALUES ('team-active', 'tournament-active');
    INSERT INTO tournament_teams VALUES ('team-completed', 'tournament-completed');
    INSERT INTO tournament_team_players VALUES ('team-player-active', 'team-active', 'player-1');
    INSERT INTO tournament_team_players VALUES ('team-player-completed', 'team-completed', 'player-1');
    INSERT INTO tournament_team_matches VALUES ('team-match-active', 'tournament-active', 'team-active', 'team-active');
    INSERT INTO tournament_team_matches VALUES ('team-match-completed', 'tournament-completed', 'team-completed', 'team-completed');
    INSERT INTO tournament_matches VALUES ('match-active', 'tournament-active', 'team-match-active', 'player-1');
    INSERT INTO tournament_matches VALUES ('match-completed', 'tournament-completed', 'team-match-completed', 'player-1');
  `);
}

beforeEach(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  setupSchema();
  seedCleanupData();
});

describe('clearHistoricalData', () => {
  it('removes historical records while preserving current data', () => {
    expect(clearHistoricalData(db)).toEqual({
      payments: 3,
      sessions: 1,
      tournaments: 1,
    });

    expect(count('players')).toBe(1);
    expect(count('balances')).toBe(1);
    expect(count('settings')).toBe(1);
    expect(count('upcoming_sessions')).toBe(1);
    expect(countWhere('sessions', "status = 'active'")).toBe(1);
    expect(countWhere('sessions', "status = 'completed'")).toBe(0);
    expect(count('payments')).toBe(0);
    expect(countWhere('tournaments', "status = 'active'")).toBe(1);
    expect(countWhere('tournaments', "status = 'completed'")).toBe(0);

    expect(countWhere('attendance', "sessionId = 'session-active'")).toBe(1);
    expect(countWhere('attendance', "sessionId = 'session-completed'")).toBe(0);
    expect(countWhere('games', "sessionId = 'session-active'")).toBe(1);
    expect(countWhere('games', "sessionId = 'session-completed'")).toBe(0);

    for (const [table, activeCondition] of [
      ['tournament_registrations', "tournamentId = 'tournament-active'"],
      ['tournament_standings', "tournamentId = 'tournament-active'"],
      ['tournament_teams', "tournamentId = 'tournament-active'"],
      ['tournament_team_players', "teamId = 'team-active'"],
      ['tournament_team_matches', "tournamentId = 'tournament-active'"],
      ['tournament_matches', "tournamentId = 'tournament-active'"],
    ] as const) {
      expect(count(table)).toBe(1);
      expect(countWhere(table, activeCondition)).toBe(1);
    }
  });

  it('rolls back all deletion when payment deletion aborts', () => {
    db.run(`
      CREATE TRIGGER abort_payment_delete
      BEFORE DELETE ON payments
      BEGIN
        SELECT RAISE(ABORT, 'payment deletion blocked');
      END;
    `);

    expect(() => clearHistoricalData(db)).toThrow('payment deletion blocked');

    expect(countWhere('sessions', "status = 'completed'")).toBe(1);
    expect(countWhere('payments', "id = 'payment-completed'")).toBe(1);
    expect(countWhere('tournaments', "status = 'completed'")).toBe(1);
  });
});
