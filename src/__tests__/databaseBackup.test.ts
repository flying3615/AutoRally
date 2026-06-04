import { describe, expect, it, beforeEach } from 'vitest';
import initSqlJs, { Database } from 'sql.js';
import { validateAutoRallyDatabase } from '../main/databaseBackup';

let db: Database;

beforeEach(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
});

describe('database backup validation', () => {
  it('accepts a database with the core AutoRally tables', () => {
    db.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE players (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE sessions (id TEXT PRIMARY KEY, date TEXT NOT NULL);
      CREATE TABLE attendance (id TEXT PRIMARY KEY, playerId TEXT NOT NULL, sessionId TEXT NOT NULL);
      CREATE TABLE games (id TEXT PRIMARY KEY, sessionId TEXT NOT NULL);
      CREATE TABLE balances (id TEXT PRIMARY KEY, playerId TEXT NOT NULL);
      CREATE TABLE payments (id TEXT PRIMARY KEY, playerId TEXT NOT NULL);
    `);

    expect(() => validateAutoRallyDatabase(db)).not.toThrow();
  });

  it('rejects a database that is missing required AutoRally tables', () => {
    db.exec('CREATE TABLE players (id TEXT PRIMARY KEY, name TEXT NOT NULL);');

    expect(() => validateAutoRallyDatabase(db)).toThrow(/not an AutoRally database backup/i);
  });
});
