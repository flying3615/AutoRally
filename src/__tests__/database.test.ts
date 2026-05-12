import { describe, it, expect, beforeEach } from 'vitest';
import initSqlJs, { Database } from 'sql.js';

let db: Database;

function setupSchema(db: Database) {
  db.run('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE players (id TEXT PRIMARY KEY, name TEXT NOT NULL, gender TEXT NOT NULL, level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 5), phone TEXT NOT NULL DEFAULT '', joinDate TEXT NOT NULL);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, date TEXT NOT NULL, startTime TEXT, endTime TEXT, courtCount INTEGER NOT NULL DEFAULT 3, status TEXT NOT NULL CHECK(status IN ('active', 'completed')));
    CREATE TABLE attendance (id TEXT PRIMARY KEY, playerId TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE, sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, checkinTime TEXT NOT NULL, UNIQUE(playerId, sessionId));
    CREATE TABLE games (id TEXT PRIMARY KEY, sessionId TEXT NOT NULL REFERENCES sessions(id), courtNumber INTEGER NOT NULL, team1Player1Id TEXT NOT NULL REFERENCES players(id), team1Player2Id TEXT NOT NULL REFERENCES players(id), team2Player1Id TEXT NOT NULL REFERENCES players(id), team2Player2Id TEXT NOT NULL REFERENCES players(id), status TEXT NOT NULL CHECK(status IN ('pending', 'playing', 'completed')), roundNumber INTEGER NOT NULL, gameType TEXT NOT NULL CHECK(gameType IN ('mixed', 'male-double', 'female-double', 'open-double')), startedAt TEXT, endedAt TEXT);
    CREATE TABLE balances (id TEXT PRIMARY KEY, playerId TEXT NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE, balance REAL NOT NULL DEFAULT 0, lastUpdated TEXT NOT NULL);
    CREATE TABLE payments (id TEXT PRIMARY KEY, playerId TEXT NOT NULL REFERENCES players(id), sessionId TEXT REFERENCES sessions(id), amount REAL NOT NULL, status TEXT NOT NULL CHECK(status IN ('paid', 'unpaid')), paidDate TEXT, paymentType TEXT NOT NULL CHECK(paymentType IN ('session', 'topup')));
    INSERT INTO settings (key, value) VALUES ('courtCount', '3');
    INSERT INTO settings (key, value) VALUES ('sessionFee', '30');
    INSERT INTO settings (key, value) VALUES ('gameDuration', '15');
  `);
}

beforeEach(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  setupSchema(db);
});

describe('Schema', () => {
  it('creates all required tables', () => {
    const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const names: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>;
      names.push(row.name as string);
    }
    stmt.free();
    expect(names).toContain('players');
    expect(names).toContain('sessions');
    expect(names).toContain('attendance');
    expect(names).toContain('games');
    expect(names).toContain('balances');
    expect(names).toContain('payments');
    expect(names).toContain('settings');
  });

  it('inserts default settings', () => {
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    stmt.bind(['courtCount']);
    expect(stmt.step()).toBe(true);
    expect(stmt.getAsObject().value).toBe('3');
    stmt.free();

    const stmt2 = db.prepare('SELECT value FROM settings WHERE key = ?');
    stmt2.bind(['sessionFee']);
    expect(stmt2.step()).toBe(true);
    expect(stmt2.getAsObject().value).toBe('30');
    stmt2.free();
  });
});

describe('Player CRUD', () => {
  it('creates a player', () => {
    db.run("INSERT INTO players (id, name, gender, level, phone, joinDate) VALUES ('p1', 'Test', 'male', 3, '123', '2025-01-01')");
    const stmt = db.prepare('SELECT * FROM players WHERE id = ?');
    stmt.bind(['p1']);
    expect(stmt.step()).toBe(true);
    const row = stmt.getAsObject() as Record<string, unknown>;
    expect(row.name).toBe('Test');
    expect(row.gender).toBe('male');
    expect(row.level).toBe(3);
    stmt.free();
  });

  it('updates a player', () => {
    db.run("INSERT INTO players (id, name, gender, level, phone, joinDate) VALUES ('p1', 'Test', 'male', 3, '123', '2025-01-01')");
    db.run("UPDATE players SET name = 'Updated', level = 5 WHERE id = 'p1'");
    const stmt = db.prepare('SELECT name, level FROM players WHERE id = ?');
    stmt.bind(['p1']);
    expect(stmt.step()).toBe(true);
    const row = stmt.getAsObject() as Record<string, unknown>;
    expect(row.name).toBe('Updated');
    expect(row.level).toBe(5);
    stmt.free();
  });

  it('deletes a player and cascades balance', () => {
    db.run("INSERT INTO players (id, name, gender, level, phone, joinDate) VALUES ('p1', 'Test', 'male', 3, '123', '2025-01-01')");
    db.run("INSERT INTO balances (id, playerId, balance, lastUpdated) VALUES ('b1', 'p1', 100, '2025-01-01')");
    // Delete player WITHOUT manually deleting balance first — cascade should handle it
    db.run("DELETE FROM players WHERE id = 'p1'");
    const balanceStmt = db.prepare("SELECT COUNT(*) as count FROM balances WHERE playerId = 'p1'");
    balanceStmt.bind([]);
    expect(balanceStmt.step()).toBe(true);
    expect((balanceStmt.getAsObject() as Record<string, unknown>).count).toBe(0);
    balanceStmt.free();
  });

  it('rejects invalid level', () => {
    expect(() => {
      db.run("INSERT INTO players (id, name, gender, level, phone, joinDate) VALUES ('p2', 'X', 'male', 6, '', '2025-01-01')");
    }).toThrow();
  });

  it('rejects attendance with non-existent player', () => {
    db.run("INSERT INTO sessions (id, date, startTime, endTime, courtCount, status) VALUES ('s1', '2025-05-10', null, null, 3, 'active')");
    expect(() => {
      db.run("INSERT INTO attendance (id, playerId, sessionId, checkinTime) VALUES ('a1', 'no-such-player', 's1', '2025-01-01')");
    }).toThrow();
  });

});

describe('Session flow', () => {
  it('creates an active session', () => {
    db.run("INSERT INTO sessions (id, date, startTime, endTime, courtCount, status) VALUES ('s1', '2025-05-10', '2025-05-10T09:00:00', NULL, 3, 'active')");
    const stmt = db.prepare("SELECT * FROM sessions WHERE status = 'active'");
    stmt.bind([]);
    expect(stmt.step()).toBe(true);
    expect((stmt.getAsObject() as Record<string, unknown>).id).toBe('s1');
    stmt.free();
  });

  it('ends a session', () => {
    db.run("INSERT INTO sessions (id, date, startTime, endTime, courtCount, status) VALUES ('s1', '2025-05-10', '2025-05-10T09:00:00', NULL, 3, 'active')");
    db.run("UPDATE sessions SET endTime = '2025-05-10T12:00:00', status = 'completed' WHERE id = 's1'");
    const stmt = db.prepare("SELECT * FROM sessions WHERE status = 'active'");
    stmt.bind([]);
    expect(stmt.step()).toBe(false);
    stmt.free();
  });
});

describe('Attendance', () => {
  beforeEach(() => {
    db.run("INSERT INTO players (id, name, gender, level, phone, joinDate) VALUES ('p1', 'Test', 'male', 3, '123', '2025-01-01')");
    db.run("INSERT INTO sessions (id, date, startTime, endTime, courtCount, status) VALUES ('s1', '2025-05-10', '2025-05-10T09:00:00', NULL, 3, 'active')");
  });

  it('records a checkin', () => {
    db.run("INSERT INTO attendance (id, playerId, sessionId, checkinTime) VALUES ('a1', 'p1', 's1', '2025-05-10T09:05:00')");
    const stmt = db.prepare('SELECT * FROM attendance WHERE sessionId = ?');
    stmt.bind(['s1']);
    expect(stmt.step()).toBe(true);
    expect((stmt.getAsObject() as Record<string, unknown>).playerId).toBe('p1');
    stmt.free();
  });

  it('prevents duplicate checkin', () => {
    db.run("INSERT INTO attendance (id, playerId, sessionId, checkinTime) VALUES ('a1', 'p1', 's1', '2025-05-10T09:05:00')");
    expect(() => {
      db.run("INSERT INTO attendance (id, playerId, sessionId, checkinTime) VALUES ('a2', 'p1', 's1', '2025-05-10T09:10:00')");
    }).toThrow();
  });
});

describe('Balance & Payment', () => {
  beforeEach(() => {
    db.run("INSERT INTO players (id, name, gender, level, phone, joinDate) VALUES ('p1', 'Rich', 'male', 3, '123', '2025-01-01')");
    db.run("INSERT INTO players (id, name, gender, level, phone, joinDate) VALUES ('p2', 'Poor', 'male', 3, '456', '2025-01-01')");
    db.run("INSERT INTO balances (id, playerId, balance, lastUpdated) VALUES ('b1', 'p1', 200, '2025-01-01')");
    db.run("INSERT INTO balances (id, playerId, balance, lastUpdated) VALUES ('b2', 'p2', 10, '2025-01-01')");
    db.run("INSERT INTO sessions (id, date, startTime, endTime, courtCount, status) VALUES ('s1', '2025-05-10', '2025-05-10T09:00:00', NULL, 3, 'active')");
  });

  it('deducts from balance when sufficient', () => {
    db.run("UPDATE balances SET balance = balance - 30, lastUpdated = '2025-05-10T09:05:00' WHERE playerId = 'p1'");
    const stmt = db.prepare('SELECT balance FROM balances WHERE playerId = ?');
    stmt.bind(['p1']);
    expect(stmt.step()).toBe(true);
    expect((stmt.getAsObject() as Record<string, unknown>).balance).toBe(170);
    stmt.free();
  });

  it('creates unpaid payment when balance insufficient', () => {
    db.run("INSERT INTO payments (id, playerId, sessionId, amount, status, paidDate, paymentType) VALUES ('py1', 'p2', 's1', 30, 'unpaid', NULL, 'session')");
    const stmt = db.prepare("SELECT * FROM payments WHERE status = 'unpaid'");
    stmt.bind([]);
    expect(stmt.step()).toBe(true);
    expect((stmt.getAsObject() as Record<string, unknown>).playerId).toBe('p2');
    stmt.free();
  });

  it('tops up balance', () => {
    db.run("UPDATE balances SET balance = balance + 100, lastUpdated = '2025-05-10' WHERE playerId = 'p2'");
    const stmt = db.prepare('SELECT balance FROM balances WHERE playerId = ?');
    stmt.bind(['p2']);
    expect(stmt.step()).toBe(true);
    expect((stmt.getAsObject() as Record<string, unknown>).balance).toBe(110);
    stmt.free();
  });

  it('marks unpaid as paid', () => {
    db.run("INSERT INTO payments (id, playerId, sessionId, amount, status, paidDate, paymentType) VALUES ('py1', 'p2', 's1', 30, 'unpaid', NULL, 'session')");
    db.run("UPDATE payments SET status = 'paid', paidDate = '2025-05-10T10:00:00' WHERE id = 'py1'");
    const stmt = db.prepare("SELECT * FROM payments WHERE status = 'unpaid'");
    stmt.bind([]);
    expect(stmt.step()).toBe(false);
    stmt.free();
  });
});

describe('Game lifecycle', () => {
  beforeEach(() => {
    db.run("INSERT INTO players (id, name, gender, level, phone, joinDate) VALUES ('p1', 'A', 'male', 3, '', '2025-01-01')");
    db.run("INSERT INTO players (id, name, gender, level, phone, joinDate) VALUES ('p2', 'B', 'male', 3, '', '2025-01-01')");
    db.run("INSERT INTO players (id, name, gender, level, phone, joinDate) VALUES ('p3', 'C', 'male', 3, '', '2025-01-01')");
    db.run("INSERT INTO players (id, name, gender, level, phone, joinDate) VALUES ('p4', 'D', 'male', 3, '', '2025-01-01')");
    db.run("INSERT INTO sessions (id, date, startTime, endTime, courtCount, status) VALUES ('s1', '2025-05-10', '2025-05-10T09:00:00', NULL, 3, 'active')");
  });

  it('transitions from pending to playing to completed', () => {
    db.run(`INSERT INTO games (id, sessionId, courtNumber, team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id, status, roundNumber, gameType)
      VALUES ('g1', 's1', 1, 'p1', 'p2', 'p3', 'p4', 'pending', 1, 'male-double')`);

    // pending
    let stmt = db.prepare("SELECT status FROM games WHERE id = 'g1'");
    stmt.bind([]);
    expect(stmt.step()).toBe(true);
    expect((stmt.getAsObject() as Record<string, unknown>).status).toBe('pending');
    stmt.free();

    // playing
    db.run("UPDATE games SET status = 'playing', startedAt = '2025-05-10T09:15:00' WHERE id = 'g1'");
    stmt = db.prepare("SELECT status FROM games WHERE id = 'g1'");
    stmt.bind([]);
    expect(stmt.step()).toBe(true);
    expect((stmt.getAsObject() as Record<string, unknown>).status).toBe('playing');
    stmt.free();

    // completed
    db.run("UPDATE games SET status = 'completed', endedAt = '2025-05-10T09:30:00' WHERE id = 'g1'");
    stmt = db.prepare("SELECT status FROM games WHERE id = 'g1'");
    stmt.bind([]);
    expect(stmt.step()).toBe(true);
    expect((stmt.getAsObject() as Record<string, unknown>).status).toBe('completed');
    stmt.free();
  });

  it('allows open-double game type', () => {
    db.run(`INSERT INTO games (id, sessionId, courtNumber, team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id, status, roundNumber, gameType)
      VALUES ('g1', 's1', 1, 'p1', 'p2', 'p3', 'p4', 'pending', 1, 'open-double')`);

    const stmt = db.prepare("SELECT gameType FROM games WHERE id = 'g1'");
    stmt.bind([]);
    expect(stmt.step()).toBe(true);
    expect((stmt.getAsObject() as Record<string, unknown>).gameType).toBe('open-double');
    stmt.free();
  });

  it('can only delete pending games', () => {
    db.run(`INSERT INTO games (id, sessionId, courtNumber, team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id, status, roundNumber, gameType)
      VALUES ('g1', 's1', 1, 'p1', 'p2', 'p3', 'p4', 'pending', 1, 'male-double')`);
    db.run(`INSERT INTO games (id, sessionId, courtNumber, team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id, status, roundNumber, gameType)
      VALUES ('g2', 's1', 2, 'p1', 'p2', 'p3', 'p4', 'playing', 1, 'male-double')`);

    // Delete pending - should work
    db.run("DELETE FROM games WHERE id = 'g1' AND status = 'pending'");
    let stmt = db.prepare("SELECT COUNT(*) as c FROM games WHERE id = 'g1'");
    stmt.bind([]);
    expect(stmt.step()).toBe(true);
    expect((stmt.getAsObject() as Record<string, unknown>).c).toBe(0);
    stmt.free();

    // Try delete playing - should not delete
    db.run("DELETE FROM games WHERE id = 'g2' AND status = 'pending'");
    stmt = db.prepare("SELECT COUNT(*) as c FROM games WHERE id = 'g2'");
    stmt.bind([]);
    expect(stmt.step()).toBe(true);
    expect((stmt.getAsObject() as Record<string, unknown>).c).toBe(1);
    stmt.free();
  });
});
