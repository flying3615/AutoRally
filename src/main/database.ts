import initSqlJs, { Database, SqlValue } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { v4 as uuid } from 'uuid';
import { validateAutoRallyDatabase } from './databaseBackup';
import { atomicWriteFile } from './atomicFileWriter';

// In dev mode, use the repo's own seed database instead of the real userData
// path — `app.getPath('userData')` is derived from package.json's top-level
// "name" field for unpackaged runs, which can coincide with a real install's
// data directory on some platforms, and `npm run dev` reseeds this file fresh
// on every launch (see scripts/seed.ts).
const dbPath = process.env.VITE_DEV_SERVER_URL && !app.isPackaged
  ? path.join(app.getAppPath(), 'autorally-seed.db')
  : path.join(app.getPath('userData'), 'autorally.db');
let db: Database | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let inTransaction = false;

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

function save(database = db) {
  if (!database) return;
  const data = database.export();
  const buf = Buffer.from(data);
  atomicWriteFile(dbPath, buf);
}

export function saveDb(database?: Database) {
  cancelPendingSave();
  save(database);
}

function cancelPendingSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

function debounceSave() {
  cancelPendingSave();
  saveTimer = setTimeout(() => {
    saveTimer = null;
    save();
  }, 500);
}

function migrate(db: Database, options: { seedIfEmpty?: boolean; saveDirty?: boolean } = {}) {
  const { seedIfEmpty = true, saveDirty = true } = options;
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
      playerId TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      checkinTime TEXT NOT NULL,
      UNIQUE(playerId, sessionId)
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      courtNumber INTEGER NOT NULL,
      team1Player1Id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      team1Player2Id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      team2Player1Id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      team2Player2Id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('pending', 'playing', 'completed')),
      roundNumber INTEGER NOT NULL,
      gameType TEXT NOT NULL CHECK(gameType IN ('mixed', 'male-double', 'female-double', 'open-double')),
      startedAt TEXT,
      endedAt TEXT,
      pausedAt TEXT,
      pausedSeconds INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS balances (
      id TEXT PRIMARY KEY,
      playerId TEXT NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,
      balance REAL NOT NULL DEFAULT 0,
      lastUpdated TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      playerId TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      sessionId TEXT REFERENCES sessions(id) ON DELETE CASCADE,
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
  // Tournaments
  db.run(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      format TEXT NOT NULL CHECK(format IN ('knockout', 'round_robin', 'mixed')),
      status TEXT NOT NULL CHECK(status IN ('upcoming', 'active', 'completed')) DEFAULT 'upcoming',
      courtCount INTEGER NOT NULL DEFAULT 4,
      createdAt TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS tournament_registrations (
      id TEXT PRIMARY KEY,
      tournamentId TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      player1Id TEXT NOT NULL REFERENCES players(id),
      player2Id TEXT REFERENCES players(id),
      registeredAt TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS tournament_matches (
      id TEXT PRIMARY KEY,
      tournamentId TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      round TEXT NOT NULL,
      matchNumber INTEGER NOT NULL DEFAULT 1,
      courtNumber INTEGER DEFAULT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'completed')) DEFAULT 'pending',
      team1Player1Id TEXT NOT NULL REFERENCES players(id),
      team1Player2Id TEXT REFERENCES players(id),
      team2Player1Id TEXT NOT NULL REFERENCES players(id),
      team2Player2Id TEXT REFERENCES players(id),
      team1Score INTEGER DEFAULT NULL,
      team2Score INTEGER DEFAULT NULL,
      winner TEXT CHECK(winner IN ('team1', 'team2')) DEFAULT NULL,
      scheduledTime TEXT,
      completedAt TEXT
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS tournament_standings (
      id TEXT PRIMARY KEY,
      tournamentId TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      player1Id TEXT NOT NULL REFERENCES players(id),
      player2Id TEXT REFERENCES players(id),
      matchesPlayed INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      pointsFor INTEGER NOT NULL DEFAULT 0,
      pointsAgainst INTEGER NOT NULL DEFAULT 0,
      UNIQUE(tournamentId, player1Id, player2Id)
    );
  `);
  // Team tournament tables
  db.run(`
    CREATE TABLE IF NOT EXISTS tournament_teams (
      id TEXT PRIMARY KEY,
      tournamentId TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      createdAt TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS tournament_team_players (
      id TEXT PRIMARY KEY,
      teamId TEXT NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
      playerId TEXT NOT NULL REFERENCES players(id),
      position INTEGER NOT NULL DEFAULT 0,
      UNIQUE(teamId, playerId)
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS tournament_team_matches (
      id TEXT PRIMARY KEY,
      tournamentId TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      round INTEGER NOT NULL,
      team1Id TEXT NOT NULL REFERENCES tournament_teams(id),
      team2Id TEXT NOT NULL REFERENCES tournament_teams(id),
      gamesPerMatch INTEGER NOT NULL DEFAULT 3,
      team1Wins INTEGER NOT NULL DEFAULT 0,
      team2Wins INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed')),
      createdAt TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS tournament_groups (
      id TEXT PRIMARY KEY,
      tournamentId TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      name TEXT NOT NULL
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
  try { db.run("ALTER TABLE players ADD COLUMN club TEXT NOT NULL DEFAULT ''"); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE games ADD COLUMN pausedAt TEXT'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE games ADD COLUMN pausedSeconds INTEGER NOT NULL DEFAULT 0'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_matches ADD COLUMN teamMatchId TEXT REFERENCES tournament_team_matches(id)'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_matches ADD COLUMN category TEXT'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_matches ADD COLUMN slotNumber INTEGER'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_team_matches ADD COLUMN msCount INTEGER NOT NULL DEFAULT 0'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_team_matches ADD COLUMN wsCount INTEGER NOT NULL DEFAULT 0'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_team_matches ADD COLUMN mdCount INTEGER NOT NULL DEFAULT 0'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_team_matches ADD COLUMN xdCount INTEGER NOT NULL DEFAULT 0'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_team_matches ADD COLUMN wdCount INTEGER NOT NULL DEFAULT 0'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_matches ADD COLUMN set1Team1Score INTEGER DEFAULT NULL'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_matches ADD COLUMN set1Team2Score INTEGER DEFAULT NULL'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_matches ADD COLUMN set2Team1Score INTEGER DEFAULT NULL'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_matches ADD COLUMN set2Team2Score INTEGER DEFAULT NULL'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_matches ADD COLUMN set3Team1Score INTEGER DEFAULT NULL'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_matches ADD COLUMN set3Team2Score INTEGER DEFAULT NULL'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournaments ADD COLUMN groupCount INTEGER'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournaments ADD COLUMN advancePerGroup INTEGER'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_registrations ADD COLUMN groupId TEXT REFERENCES tournament_groups(id)'); dirty = true; } catch (_) { /* already exists */ }
  try { db.run('ALTER TABLE tournament_matches ADD COLUMN groupId TEXT REFERENCES tournament_groups(id)'); dirty = true; } catch (_) { /* already exists */ }
  if (migrateGameTypeConstraint(db)) dirty = true;
  if (migrateAttendanceAndBalancesCascade(db)) dirty = true;

  if (seedIfEmpty) seedPlayersIfEmpty(db);

  if (dirty && saveDirty) save();
}

export function getDatabasePath() {
  return dbPath;
}

export function exportDatabaseBackup(destinationPath: string) {
  saveDb();
  fs.copyFileSync(dbPath, destinationPath);
}

export async function importDatabaseBackup(sourcePath: string) {
  const SQL = await initSqlJs();
  const imported = new SQL.Database(fs.readFileSync(sourcePath));
  try {
    imported.run('PRAGMA foreign_keys = ON');
    validateAutoRallyDatabase(imported);
    migrate(imported, { seedIfEmpty: false, saveDirty: false });
    validateAutoRallyDatabase(imported);

    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    const tmpPath = dbPath + '.import';
    fs.writeFileSync(tmpPath, Buffer.from(imported.export()));
    // Only close/replace the live db once the rename has actually succeeded —
    // otherwise a mid-import failure (locked file, cross-device rename) leaves
    // the module-level singleton closed with no replacement assigned.
    fs.renameSync(tmpPath, dbPath);
    if (db) db.close();
    db = imported;
  } catch (err) {
    imported.close();
    throw err;
  }
}

function seedPlayersIfEmpty(db: Database) {
  const existing = (db.exec("SELECT COUNT(*) as c FROM players")[0]?.values?.[0]?.[0] as number) ?? 0;
  if (existing > 0) return;

  const seedPath = path.join(app.getAppPath(), 'kapiti_players.csv');
  if (!fs.existsSync(seedPath)) return;

  const content = fs.readFileSync(seedPath, 'utf-8');
  const lines = content.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return;

  const header = lines[0]!.toLowerCase();
  const cols = header.split(',').map(c => c.trim());
  const firstNameIdx = cols.findIndex(c => c.includes('first') && c.includes('name'));
  const lastNameIdx = cols.findIndex(c => c.includes('last') && c.includes('name'));
  const levelIdx = cols.findIndex(c => c === 'level');
  const genderIdx = cols.findIndex(c => c === 'gender');

  if (levelIdx === -1 || genderIdx === -1 || firstNameIdx === -1 || lastNameIdx === -1) return;

  const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i]!.split(',').map(c => c.trim());
    const first = titleCase(parts[firstNameIdx] || '');
    const last = titleCase(parts[lastNameIdx] || '');
    const name = `${first} ${last}`.trim();
    const gender = parts[genderIdx]?.toLowerCase() === 'female' ? 'female' : 'male';
    const level = Math.max(1, Math.min(5, Number(parts[levelIdx]) || 3));
    const pid = uuid();
    const now = new Date().toISOString();
    db.run('INSERT INTO players (id, name, gender, level, phone, email, joinDate) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [pid, name, gender, level, '', '', now]);
    db.run('INSERT INTO balances (id, playerId, balance, lastUpdated) VALUES (?, ?, 0, ?)',
      [uuid(), pid, now]);
  }
  console.log(`Seeded ${lines.length - 1} players from kapiti_players.csv`);
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
        sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        courtNumber INTEGER NOT NULL,
        team1Player1Id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        team1Player2Id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        team2Player1Id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        team2Player2Id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK(status IN ('pending', 'playing', 'completed')),
        roundNumber INTEGER NOT NULL,
        gameType TEXT NOT NULL CHECK(gameType IN ('mixed', 'male-double', 'female-double', 'open-double')),
        startedAt TEXT,
        endedAt TEXT,
        pausedAt TEXT,
        pausedSeconds INTEGER NOT NULL DEFAULT 0
      );
    `);
    db.run(`
      INSERT INTO games_new (
        id, sessionId, courtNumber,
        team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id,
        status, roundNumber, gameType, startedAt, endedAt, pausedAt, pausedSeconds
      )
      SELECT
        id, sessionId, courtNumber,
        team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id,
        status, roundNumber,
        CASE WHEN gameType = 'same-gender' THEN 'male-double' ELSE gameType END,
        startedAt, endedAt, pausedAt, COALESCE(pausedSeconds, 0)
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

function tableHasCascade(db: Database, tableName: string): boolean {
  const stmt = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`);
  stmt.bind([tableName]);
  const row = stmt.step() ? stmt.getAsObject() as { sql?: string } : undefined;
  stmt.free();
  return !!row?.sql && row.sql.includes('ON DELETE CASCADE');
}

function migrateAttendanceAndBalancesCascade(db: Database): boolean {
  const attendanceNeedsMigration = !tableHasCascade(db, 'attendance');
  const balancesNeedsMigration = !tableHasCascade(db, 'balances');
  const paymentsNeedsMigration = !tableHasCascade(db, 'payments');
  const gamesNeedsMigration = !tableHasCascade(db, 'games');

  if (!attendanceNeedsMigration && !balancesNeedsMigration && !paymentsNeedsMigration && !gamesNeedsMigration) {
    return false;
  }

  db.run('PRAGMA foreign_keys = OFF');
  db.run('BEGIN TRANSACTION');
  try {
    if (attendanceNeedsMigration) {
      db.run(`
        CREATE TABLE attendance_new (
          id TEXT PRIMARY KEY,
          playerId TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          checkinTime TEXT NOT NULL,
          UNIQUE(playerId, sessionId)
        );
      `);
      db.run(`
        INSERT INTO attendance_new (id, playerId, sessionId, checkinTime)
        SELECT id, playerId, sessionId, checkinTime FROM attendance;
      `);
      db.run('DROP TABLE attendance');
      db.run('ALTER TABLE attendance_new RENAME TO attendance');
    }

    if (balancesNeedsMigration) {
      db.run(`
        CREATE TABLE balances_new (
          id TEXT PRIMARY KEY,
          playerId TEXT NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,
          balance REAL NOT NULL DEFAULT 0,
          lastUpdated TEXT NOT NULL
        );
      `);
      db.run(`
        INSERT INTO balances_new (id, playerId, balance, lastUpdated)
        SELECT id, playerId, balance, lastUpdated FROM balances;
      `);
      db.run('DROP TABLE balances');
      db.run('ALTER TABLE balances_new RENAME TO balances');
    }

    if (paymentsNeedsMigration) {
      db.run(`
        CREATE TABLE payments_new (
          id TEXT PRIMARY KEY,
          playerId TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          sessionId TEXT REFERENCES sessions(id) ON DELETE CASCADE,
          amount REAL NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('paid', 'unpaid')),
          paidDate TEXT,
          paymentType TEXT NOT NULL CHECK(paymentType IN ('session', 'topup')),
          paymentMethod TEXT NOT NULL DEFAULT ''
        );
      `);
      db.run(`
        INSERT INTO payments_new (id, playerId, sessionId, amount, status, paidDate, paymentType, paymentMethod)
        SELECT id, playerId, sessionId, amount, status, paidDate, paymentType,
          COALESCE(paymentMethod, '') FROM payments;
      `);
      db.run('DROP TABLE payments');
      db.run('ALTER TABLE payments_new RENAME TO payments');
    }

    if (gamesNeedsMigration) {
      db.run(`
        CREATE TABLE games_new (
          id TEXT PRIMARY KEY,
          sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          courtNumber INTEGER NOT NULL,
          team1Player1Id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          team1Player2Id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          team2Player1Id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          team2Player2Id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          status TEXT NOT NULL CHECK(status IN ('pending', 'playing', 'completed')),
          roundNumber INTEGER NOT NULL,
          gameType TEXT NOT NULL CHECK(gameType IN ('mixed', 'male-double', 'female-double', 'open-double')),
          startedAt TEXT,
          endedAt TEXT,
          pausedAt TEXT,
          pausedSeconds INTEGER NOT NULL DEFAULT 0
        );
      `);
      db.run(`
        INSERT INTO games_new (
          id, sessionId, courtNumber,
          team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id,
          status, roundNumber, gameType, startedAt, endedAt, pausedAt, pausedSeconds
        )
        SELECT
          id, sessionId, courtNumber,
          team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id,
          status, roundNumber, gameType, startedAt, endedAt,
          pausedAt, COALESCE(pausedSeconds, 0)
        FROM games;
      `);
      db.run('DROP TABLE games');
      db.run('ALTER TABLE games_new RENAME TO games');
    }

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
  if (!inTransaction) debounceSave();
}

// Internal use only: execute a write while preserving the current persistence schedule.
export function runWithoutAutosave(sql: string, params?: SqlValue[]) {
  const d = getDb();
  d.run(sql, params);
}

export function transaction<T>(fn: () => T): T {
  const d = getDb();

  // Prevent a previously scheduled auto-save from firing mid-transaction.
  cancelPendingSave();

  const wasInTransaction = inTransaction;
  d.run('BEGIN');
  inTransaction = true;

  let committed = false;
  try {
    const result = fn();
    d.run('COMMIT');
    committed = true;
    return result;
  } catch (err) {
    try {
      d.run('ROLLBACK');
    } catch {
      // Ignore rollback errors and preserve the original failure.
    }
    throw err;
  } finally {
    inTransaction = wasInTransaction;
    if (committed && !inTransaction) debounceSave();
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
