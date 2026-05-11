import initSqlJs, { Database, SqlValue } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

const dbPath = path.join(app.getPath('userData'), 'autorally.db');
let db: Database | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export async function initDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

function save() {
  if (!db) return;
  const data = db.export();
  const buf = Buffer.from(data);
  fs.writeFileSync(dbPath, buf);
}

export function saveDb() {
  save();
}

function debounceSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 500);
}

function migrate(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      gender TEXT NOT NULL CHECK(gender IN ('male', 'female')),
      level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 5),
      phone TEXT NOT NULL DEFAULT '',
      joinDate TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      startTime TEXT,
      endTime TEXT,
      courtCount INTEGER NOT NULL DEFAULT 3,
      status TEXT NOT NULL CHECK(status IN ('active', 'completed'))
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      playerId TEXT NOT NULL REFERENCES players(id),
      sessionId TEXT NOT NULL REFERENCES sessions(id),
      checkinTime TEXT NOT NULL,
      UNIQUE(playerId, sessionId)
    );
  `);
  db.run(`
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
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS balances (
      id TEXT PRIMARY KEY,
      playerId TEXT NOT NULL UNIQUE REFERENCES players(id),
      balance REAL NOT NULL DEFAULT 0,
      lastUpdated TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      playerId TEXT NOT NULL REFERENCES players(id),
      sessionId TEXT REFERENCES sessions(id),
      amount REAL NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('paid', 'unpaid')),
      paidDate TEXT,
      paymentType TEXT NOT NULL CHECK(paymentType IN ('session', 'topup'))
    );
  `);
  db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('courtCount', '3')");
  db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('sessionFee', '30')");
  db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('gameDuration', '15')");

  // Migrations for existing databases
  try { db.run('ALTER TABLE attendance ADD COLUMN paused INTEGER NOT NULL DEFAULT 0'); } catch (_) { /* already exists */ }

  save();
}

export function closeDb() {
  if (db) {
    save();
    db.close();
    db = null;
  }
}

// Helper to auto-save after writes
export function run(sql: string, params?: SqlValue[]) {
  const d = getDb();
  d.run(sql, params);
  debounceSave();
}

export function queryOne<T>(sql: string, params?: SqlValue[]): T | undefined {
  const d = getDb();
  const stmt = d.prepare(sql);
  stmt.bind(params ?? []);
  if (stmt.step()) {
    const row = stmt.getAsObject() as T;
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

export function queryAll<T>(sql: string, params?: SqlValue[]): T[] {
  const d = getDb();
  const stmt = d.prepare(sql);
  stmt.bind(params ?? []);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}
