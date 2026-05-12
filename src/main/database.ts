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
  const tmpPath = dbPath + '.tmp';
  fs.writeFileSync(tmpPath, buf);
  fs.renameSync(tmpPath, dbPath);
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
      email TEXT NOT NULL DEFAULT '',
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
      gameType TEXT NOT NULL CHECK(gameType IN ('mixed', 'male-double', 'female-double', 'open-double')),
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
  db.run(`
    CREATE TABLE IF NOT EXISTS upcoming_sessions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      time TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT ''
    );
  `);
  db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('courtCount', '4')");
  db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('sessionFee', '10')");
  db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('gameDuration', '15')");

  // Migrations for existing databases
  let dirty = false;
  try { db.run('ALTER TABLE players ADD COLUMN email TEXT NOT NULL DEFAULT \'\''); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE attendance ADD COLUMN paused INTEGER NOT NULL DEFAULT 0'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE payments ADD COLUMN paymentMethod TEXT NOT NULL DEFAULT \'\''); dirty = true; } catch (_) { /* already exists */ }
  if (migrateGameTypeConstraint(db)) dirty = true;

  if (dirty) save();
}

function migrateGameTypeConstraint(db: Database): boolean {
  const stmt = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'games'");
  const row = stmt.step() ? stmt.getAsObject() as { sql?: string } : undefined;
  stmt.free();
  if (!row?.sql || row.sql.includes("'open-double'")) return false;

  db.run('PRAGMA foreign_keys = OFF');
  db.run('BEGIN TRANSACTION');
  try {
    db.run(`
      CREATE TABLE games_new (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL REFERENCES sessions(id),
        courtNumber INTEGER NOT NULL,
        team1Player1Id TEXT NOT NULL REFERENCES players(id),
        team1Player2Id TEXT NOT NULL REFERENCES players(id),
        team2Player1Id TEXT NOT NULL REFERENCES players(id),
        team2Player2Id TEXT NOT NULL REFERENCES players(id),
        status TEXT NOT NULL CHECK(status IN ('pending', 'playing', 'completed')),
        roundNumber INTEGER NOT NULL,
        gameType TEXT NOT NULL CHECK(gameType IN ('mixed', 'male-double', 'female-double', 'open-double')),
        startedAt TEXT,
        endedAt TEXT
      );
    `);
    db.run(`
      INSERT INTO games_new (
        id, sessionId, courtNumber,
        team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id,
        status, roundNumber, gameType, startedAt, endedAt
      )
      SELECT
        id, sessionId, courtNumber,
        team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id,
        status, roundNumber,
        CASE WHEN gameType = 'same-gender' THEN 'male-double' ELSE gameType END,
        startedAt, endedAt
      FROM games;
    `);
    db.run('DROP TABLE games');
    db.run('ALTER TABLE games_new RENAME TO games');
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  } finally {
    db.run('PRAGMA foreign_keys = ON');
  }
  return true;
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

export function transaction<T>(fn: () => T): T {
  const d = getDb();
  d.run('BEGIN');
  try {
    const result = fn();
    d.run('COMMIT');
    return result;
  } catch (err) {
    d.run('ROLLBACK');
    throw err;
  }
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
