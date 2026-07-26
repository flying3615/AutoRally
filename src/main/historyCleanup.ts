import type { Database } from 'sql.js';

export interface HistoricalDataCleanupResult {
  payments: number;
  sessions: number;
  tournaments: number;
}

export type HistoricalDataPersistence = (database: Database) => void;

function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function deleteHistoricalData(db: Database, today: string): HistoricalDataCleanupResult {
  const historicalTournamentPredicate = "status = 'completed' OR date < ?";
  const historicalTournamentIds = `SELECT id FROM tournaments WHERE ${historicalTournamentPredicate}`;

  db.run('DELETE FROM payments');
  const payments = db.getRowsModified();

  db.run("DELETE FROM games WHERE sessionId IN (SELECT id FROM sessions WHERE status = 'completed')");
  db.run("DELETE FROM sessions WHERE status = 'completed'");
  const sessions = db.getRowsModified();

  db.run(`DELETE FROM tournament_matches WHERE tournamentId IN (${historicalTournamentIds})`, [today]);
  db.run(`DELETE FROM tournament_standings WHERE tournamentId IN (${historicalTournamentIds})`, [today]);
  db.run(`DELETE FROM tournament_team_players WHERE teamId IN (SELECT id FROM tournament_teams WHERE tournamentId IN (${historicalTournamentIds}))`, [today]);
  db.run(`DELETE FROM tournament_team_matches WHERE tournamentId IN (${historicalTournamentIds})`, [today]);
  db.run(`DELETE FROM tournament_teams WHERE tournamentId IN (${historicalTournamentIds})`, [today]);
  db.run(`DELETE FROM tournament_registrations WHERE tournamentId IN (${historicalTournamentIds})`, [today]);
  db.run(`DELETE FROM tournaments WHERE ${historicalTournamentPredicate}`, [today]);
  const tournaments = db.getRowsModified();

  return { payments, sessions, tournaments };
}

export function clearHistoricalData(db: Database, persist?: HistoricalDataPersistence): HistoricalDataCleanupResult {
  const today = localDateString(new Date());
  const foreignKeysEnabled = persist && db.exec('PRAGMA foreign_keys')[0]?.values[0]?.[0] === 1;
  const originalData = persist ? db.export() : undefined;
  if (foreignKeysEnabled) db.run('PRAGMA foreign_keys = ON');
  const persistedDb = persist && originalData
    ? new (db.constructor as new (data: Uint8Array) => Database)(originalData)
    : undefined;
  if (foreignKeysEnabled) persistedDb?.run('PRAGMA foreign_keys = ON');

  db.run('BEGIN');

  try {
    const result = deleteHistoricalData(db, today);
    if (persist && persistedDb) {
      // sql.js export closes a database and aborts its open transaction.
      deleteHistoricalData(persistedDb, today);
      persist(persistedDb);
    }
    db.run('COMMIT');
    return result;
  } catch (error) {
    try {
      db.run('ROLLBACK');
    } catch {
      // A persistence callback may have closed the database transaction.
    }
    throw error;
  } finally {
    persistedDb?.close();
  }
}
