import { ipcMain } from 'electron';
import { v4 as uuid } from 'uuid';
import { getDb } from './database.js';

export function registerIpcHandlers() {
  // ── Settings ──
  ipcMain.handle('settings:getAll', () => {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
  });

  ipcMain.handle('settings:set', (_e, key: string, value: string) => {
    const db = getDb();
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  });

  // ── Players ──
  ipcMain.handle('players:list', () => {
    const db = getDb();
    return db.prepare(`
      SELECT p.*, COALESCE(b.balance, 0) as balance
      FROM players p
      LEFT JOIN balances b ON b.playerId = p.id
      ORDER BY p.name
    `).all();
  });

  ipcMain.handle('players:create', (_e, player: { name: string; gender: string; level: number; phone: string }) => {
    const db = getDb();
    const id = uuid();
    const joinDate = new Date().toISOString();
    db.prepare('INSERT INTO players (id, name, gender, level, phone, joinDate) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, player.name, player.gender, player.level, player.phone, joinDate);
    db.prepare('INSERT INTO balances (id, playerId, balance, lastUpdated) VALUES (?, ?, 0, ?)')
      .run(uuid(), id, joinDate);
    return { id, ...player, joinDate };
  });

  ipcMain.handle('players:update', (_e, id: string, data: { name?: string; gender?: string; level?: number; phone?: string }) => {
    const db = getDb();
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(data)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    vals.push(id);
    db.prepare(`UPDATE players SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  });

  ipcMain.handle('players:delete', (_e, id: string) => {
    const db = getDb();
    db.prepare('DELETE FROM balances WHERE playerId = ?').run(id);
    db.prepare('DELETE FROM payments WHERE playerId = ?').run(id);
    db.prepare('DELETE FROM attendance WHERE playerId = ?').run(id);
    db.prepare('DELETE FROM players WHERE id = ?').run(id);
  });

  // ── Sessions ──
  ipcMain.handle('sessions:list', () => {
    const db = getDb();
    return db.prepare('SELECT * FROM sessions ORDER BY date DESC').all();
  });

  ipcMain.handle('sessions:getActive', () => {
    const db = getDb();
    return db.prepare("SELECT * FROM sessions WHERE status = 'active'").get();
  });

  ipcMain.handle('sessions:create', (_e, courtCount: number) => {
    const db = getDb();
    const id = uuid();
    const date = new Date().toISOString().split('T')[0]!;
    db.prepare('INSERT INTO sessions (id, date, startTime, endTime, courtCount, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, date, new Date().toISOString(), null, courtCount, 'active');
    return { id, date, startTime: new Date().toISOString(), endTime: null, courtCount, status: 'active' as const };
  });

  ipcMain.handle('sessions:end', (_e, id: string) => {
    const db = getDb();
    db.prepare("UPDATE sessions SET endTime = ?, status = 'completed' WHERE id = ?")
      .run(new Date().toISOString(), id);
  });

  // ── Attendance ──
  ipcMain.handle('attendance:checkin', (_e, playerId: string, sessionId: string) => {
    const db = getDb();
    const id = uuid();
    const checkinTime = new Date().toISOString();
    try {
      db.prepare('INSERT INTO attendance (id, playerId, sessionId, checkinTime) VALUES (?, ?, ?, ?)')
        .run(id, playerId, sessionId, checkinTime);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('UNIQUE')) return null;
      throw err;
    }
    // Auto-create payment
    const fee = db.prepare("SELECT value FROM settings WHERE key = 'sessionFee'").get() as { value: string } | undefined;
    const sessionFee = Number(fee?.value ?? 30);
    const balance = db.prepare('SELECT balance FROM balances WHERE playerId = ?').get(playerId) as { balance: number } | undefined;
    if (balance && balance.balance >= sessionFee) {
      db.prepare('UPDATE balances SET balance = balance - ?, lastUpdated = ? WHERE playerId = ?')
        .run(sessionFee, checkinTime, playerId);
      db.prepare('INSERT INTO payments (id, playerId, sessionId, amount, status, paidDate, paymentType) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(uuid(), playerId, sessionId, sessionFee, 'paid', checkinTime, 'session');
    } else {
      db.prepare('INSERT INTO payments (id, playerId, sessionId, amount, status, paidDate, paymentType) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(uuid(), playerId, sessionId, sessionFee, 'unpaid', null, 'session');
    }
    return { id, playerId, sessionId, checkinTime };
  });

  ipcMain.handle('attendance:listBySession', (_e, sessionId: string) => {
    const db = getDb();
    return db.prepare(`
      SELECT a.*, p.name, p.gender, p.level
      FROM attendance a JOIN players p ON a.playerId = p.id
      WHERE a.sessionId = ?
      ORDER BY a.checkinTime
    `).all(sessionId);
  });

  // ── Games ──
  ipcMain.handle('games:listBySession', (_e, sessionId: string) => {
    const db = getDb();
    return db.prepare(`
      SELECT g.*,
        p1.name as t1p1Name, p2.name as t1p2Name,
        p3.name as t2p1Name, p4.name as t2p2Name
      FROM games g
      JOIN players p1 ON g.team1Player1Id = p1.id
      JOIN players p2 ON g.team1Player2Id = p2.id
      JOIN players p3 ON g.team2Player1Id = p3.id
      JOIN players p4 ON g.team2Player2Id = p4.id
      WHERE g.sessionId = ?
      ORDER BY g.roundNumber, g.courtNumber
    `).all(sessionId);
  });

  ipcMain.handle('games:create', (_e, game: {
    sessionId: string; courtNumber: number;
    team1Player1Id: string; team1Player2Id: string;
    team2Player1Id: string; team2Player2Id: string;
    roundNumber: number; gameType: string;
  }) => {
    const db = getDb();
    const id = uuid();
    db.prepare(`INSERT INTO games (id, sessionId, courtNumber, team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id, status, roundNumber, gameType)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
      .run(id, game.sessionId, game.courtNumber, game.team1Player1Id, game.team1Player2Id, game.team2Player1Id, game.team2Player2Id, game.roundNumber, game.gameType);
    return { id, ...game, status: 'pending' as const };
  });

  ipcMain.handle('games:start', (_e, id: string) => {
    const db = getDb();
    db.prepare("UPDATE games SET status = 'playing', startedAt = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  });

  ipcMain.handle('games:complete', (_e, id: string) => {
    const db = getDb();
    db.prepare("UPDATE games SET status = 'completed', endedAt = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  });

  ipcMain.handle('games:delete', (_e, id: string) => {
    const db = getDb();
    db.prepare('DELETE FROM games WHERE id = ? AND status = ?').run(id, 'pending');
  });

  ipcMain.handle('games:maxRound', (_e, sessionId: string) => {
    const db = getDb();
    const row = db.prepare('SELECT MAX(roundNumber) as maxRound FROM games WHERE sessionId = ?').get(sessionId) as { maxRound: number | null };
    return row?.maxRound ?? 0;
  });

  // ── Payments ──
  ipcMain.handle('payments:listBySession', (_e, sessionId: string) => {
    const db = getDb();
    return db.prepare(`
      SELECT py.*, p.name as playerName
      FROM payments py JOIN players p ON py.playerId = p.id
      WHERE py.sessionId = ?
      ORDER BY py.paymentType, p.name
    `).all(sessionId);
  });

  ipcMain.handle('payments:listUnpaid', () => {
    const db = getDb();
    return db.prepare(`
      SELECT py.*, p.name as playerName, p.phone
      FROM payments py JOIN players p ON py.playerId = p.id
      WHERE py.status = 'unpaid' AND py.paymentType = 'session'
      ORDER BY py.paidDate DESC
    `).all();
  });

  ipcMain.handle('payments:markPaid', (_e, id: string) => {
    const db = getDb();
    db.prepare('UPDATE payments SET status = ?, paidDate = ? WHERE id = ?')
      .run('paid', new Date().toISOString(), id);
  });

  ipcMain.handle('payments:topup', (_e, playerId: string, amount: number) => {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO payments (id, playerId, sessionId, amount, status, paidDate, paymentType) VALUES (?, ?, NULL, ?, ?, ?, ?)')
      .run(uuid(), playerId, amount, 'paid', now, 'topup');
    db.prepare('UPDATE balances SET balance = balance + ?, lastUpdated = ? WHERE playerId = ?')
      .run(amount, now, playerId);
  });

  // ── Balances ──
  ipcMain.handle('balances:get', (_e, playerId: string) => {
    const db = getDb();
    const row = db.prepare('SELECT balance FROM balances WHERE playerId = ?').get(playerId) as { balance: number } | undefined;
    return row?.balance ?? 0;
  });

  ipcMain.handle('balances:listLow', (_e, threshold: number) => {
    const db = getDb();
    return db.prepare(`
      SELECT b.*, p.name as playerName, p.phone
      FROM balances b JOIN players p ON b.playerId = p.id
      WHERE b.balance < ?
      ORDER BY b.balance ASC
    `).all(threshold);
  });

  // ── History ──
  ipcMain.handle('history:playerStats', (_e, playerId: string) => {
    const db = getDb();
    const sessionCount = db.prepare('SELECT COUNT(DISTINCT sessionId) as count FROM attendance WHERE playerId = ?').get(playerId) as { count: number };
    const gameCount = db.prepare(`
      SELECT COUNT(*) as count FROM games WHERE
        (team1Player1Id = ? OR team1Player2Id = ? OR team2Player1Id = ? OR team2Player2Id = ?)
        AND status = 'completed'
    `).get(playerId, playerId, playerId, playerId) as { count: number };
    return { sessionCount: sessionCount.count, gameCount: gameCount.count };
  });
}
