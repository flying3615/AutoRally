import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

const dbPath = path.join(app.getPath('userData'), 'autorally.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db);
  }
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      gender TEXT NOT NULL CHECK(gender IN ('male', 'female')),
      level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 5),
      phone TEXT NOT NULL DEFAULT '',
      joinDate TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      startTime TEXT,
      endTime TEXT,
      courtCount INTEGER NOT NULL DEFAULT 3,
      status TEXT NOT NULL CHECK(status IN ('active', 'completed'))
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      playerId TEXT NOT NULL REFERENCES players(id),
      sessionId TEXT NOT NULL REFERENCES sessions(id),
      checkinTime TEXT NOT NULL,
      UNIQUE(playerId, sessionId)
    );

    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL REFERENCES sessions(id),
      courtNumber INTEGER NOT NULL,
      team1Player1Id TEXT NOT NULL REFERENCES players(id),
      team1Player2Id TEXT NOT NULL REFERENCES players(id),
      team2Player1Id TEXT NOT NULL REFERENCES players(id),
      team2Player2Id TEXT NOT NULL REFERENCES players(id),
      status TEXT NOT NULL CHECK(status IN ('pending', 'playing', 'completed')),
      roundNumber INTEGER NOT NULL,
      gameType TEXT NOT NULL CHECK(gameType IN ('same-gender', 'mixed')),
      startedAt TEXT,
      endedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS balances (
      id TEXT PRIMARY KEY,
      playerId TEXT NOT NULL UNIQUE REFERENCES players(id),
      balance REAL NOT NULL DEFAULT 0,
      lastUpdated TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      playerId TEXT NOT NULL REFERENCES players(id),
      sessionId TEXT REFERENCES sessions(id),
      amount REAL NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('paid', 'unpaid')),
      paidDate TEXT,
      paymentType TEXT NOT NULL CHECK(paymentType IN ('session', 'topup'))
    );

    INSERT OR IGNORE INTO settings (key, value) VALUES ('courtCount', '3');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('sessionFee', '30');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('gameDuration', '15');
  `);
}

export function closeDb() {
  if (db) {
    db.close();
  }
}
