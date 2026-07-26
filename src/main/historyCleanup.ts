import type { Database } from 'sql.js';

export interface HistoricalDataCleanupResult {
  payments: number;
  sessions: number;
  tournaments: number;
}

export function clearHistoricalData(db: Database): HistoricalDataCleanupResult {
  db.run('BEGIN');

  try {
    db.run('DELETE FROM payments');
    const payments = db.getRowsModified();

    db.run("DELETE FROM games WHERE sessionId IN (SELECT id FROM sessions WHERE status = 'completed')");
    db.run("DELETE FROM sessions WHERE status = 'completed'");
    const sessions = db.getRowsModified();

    db.run("DELETE FROM tournament_matches WHERE tournamentId IN (SELECT id FROM tournaments WHERE status = 'completed')");
    db.run("DELETE FROM tournament_standings WHERE tournamentId IN (SELECT id FROM tournaments WHERE status = 'completed')");
    db.run("DELETE FROM tournament_team_players WHERE teamId IN (SELECT id FROM tournament_teams WHERE tournamentId IN (SELECT id FROM tournaments WHERE status = 'completed'))");
    db.run("DELETE FROM tournament_team_matches WHERE tournamentId IN (SELECT id FROM tournaments WHERE status = 'completed')");
    db.run("DELETE FROM tournament_teams WHERE tournamentId IN (SELECT id FROM tournaments WHERE status = 'completed')");
    db.run("DELETE FROM tournament_registrations WHERE tournamentId IN (SELECT id FROM tournaments WHERE status = 'completed')");
    db.run("DELETE FROM tournaments WHERE status = 'completed'");
    const tournaments = db.getRowsModified();

    db.run('COMMIT');
    return { payments, sessions, tournaments };
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}
