import { ipcMain } from 'electron';
import { v4 as uuid } from 'uuid';
import { SqlValue } from 'sql.js';
import { initDb, run, queryAll, queryOne } from './database';

export async function registerIpcHandlers() {
  const db = await initDb();

  // ── Settings ──
  ipcMain.handle('settings:getAll', () => {
    const rows = queryAll<{ key: string; value: string }>('SELECT key, value FROM settings');
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
  });

  ipcMain.handle('settings:set', (_e, key: string, value: string) => {
    run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  });

  // ── Players ──
  ipcMain.handle('players:list', () => {
    return queryAll('SELECT p.*, COALESCE(b.balance, 0) as balance FROM players p LEFT JOIN balances b ON b.playerId = p.id ORDER BY p.name');
  });

  ipcMain.handle('players:create', (_e, player: { name: string; gender: string; level: number; phone: string }) => {
    const id = uuid();
    const joinDate = new Date().toISOString();
    run('INSERT INTO players (id, name, gender, level, phone, joinDate) VALUES (?, ?, ?, ?, ?, ?)',
      [id, player.name, player.gender, player.level, player.phone, joinDate]);
    run('INSERT INTO balances (id, playerId, balance, lastUpdated) VALUES (?, ?, 0, ?)',
      [uuid(), id, joinDate]);
    return { id, ...player, joinDate };
  });

  ipcMain.handle('players:update', (_e, id: string, data: { name?: string; gender?: string; level?: number; phone?: string }) => {
    const sets: string[] = [];
    const vals: SqlValue[] = [];
    for (const [k, v] of Object.entries(data)) {
      sets.push(`${k} = ?`);
      vals.push(v as SqlValue);
    }
    vals.push(id);
    run(`UPDATE players SET ${sets.join(', ')} WHERE id = ?`, vals);
  });

  ipcMain.handle('players:delete', (_e, id: string) => {
    run('DELETE FROM balances WHERE playerId = ?', [id]);
    run('DELETE FROM payments WHERE playerId = ?', [id]);
    run('DELETE FROM attendance WHERE playerId = ?', [id]);
    run('DELETE FROM players WHERE id = ?', [id]);
  });

  // ── Sessions ──
  ipcMain.handle('sessions:list', () => {
    return queryAll('SELECT * FROM sessions ORDER BY date DESC');
  });

  ipcMain.handle('sessions:getActive', () => {
    return queryOne("SELECT * FROM sessions WHERE status = 'active'");
  });

  ipcMain.handle('sessions:create', (_e, courtCount: number) => {
    const id = uuid();
    const date = new Date().toISOString().split('T')[0]!;
    const startTime = new Date().toISOString();
    run('INSERT INTO sessions (id, date, startTime, endTime, courtCount, status) VALUES (?, ?, ?, ?, ?, ?)',
      [id, date, startTime, null, courtCount, 'active']);
    return { id, date, startTime, endTime: null, courtCount, status: 'active' as const };
  });

  ipcMain.handle('sessions:end', (_e, id: string) => {
    run("UPDATE sessions SET endTime = ?, status = 'completed' WHERE id = ?",
      [new Date().toISOString(), id]);
  });

  // ── Attendance ──
  ipcMain.handle('attendance:checkin', (_e, playerId: string, sessionId: string) => {
    const id = uuid();
    const checkinTime = new Date().toISOString();
    try {
      run('INSERT INTO attendance (id, playerId, sessionId, checkinTime) VALUES (?, ?, ?, ?)',
        [id, playerId, sessionId, checkinTime]);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('UNIQUE')) return null;
      throw err;
    }
    const fee = queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'sessionFee'");
    const sessionFee = Number(fee?.value ?? 30);
    const balance = queryOne<{ balance: number }>('SELECT balance FROM balances WHERE playerId = ?', [playerId]);
    if (balance && balance.balance >= sessionFee) {
      run('UPDATE balances SET balance = balance - ?, lastUpdated = ? WHERE playerId = ?',
        [sessionFee, checkinTime, playerId]);
      run('INSERT INTO payments (id, playerId, sessionId, amount, status, paidDate, paymentType) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid(), playerId, sessionId, sessionFee, 'paid', checkinTime, 'session']);
    } else {
      run('INSERT INTO payments (id, playerId, sessionId, amount, status, paidDate, paymentType) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid(), playerId, sessionId, sessionFee, 'unpaid', null, 'session']);
    }
    return { id, playerId, sessionId, checkinTime };
  });

  ipcMain.handle('attendance:listBySession', (_e, sessionId: string) => {
    return queryAll(
      'SELECT a.*, p.name, p.gender, p.level FROM attendance a JOIN players p ON a.playerId = p.id WHERE a.sessionId = ? ORDER BY a.checkinTime',
      [sessionId]
    );
  });

  // ── Games ──
  ipcMain.handle('games:listBySession', (_e, sessionId: string) => {
    return queryAll(
      `SELECT g.*, p1.name as t1p1Name, p2.name as t1p2Name, p3.name as t2p1Name, p4.name as t2p2Name
       FROM games g
       JOIN players p1 ON g.team1Player1Id = p1.id
       JOIN players p2 ON g.team1Player2Id = p2.id
       JOIN players p3 ON g.team2Player1Id = p3.id
       JOIN players p4 ON g.team2Player2Id = p4.id
       WHERE g.sessionId = ?
       ORDER BY g.roundNumber, g.courtNumber`,
      [sessionId]
    );
  });

  ipcMain.handle('games:create', (_e, game: {
    sessionId: string; courtNumber: number;
    team1Player1Id: string; team1Player2Id: string;
    team2Player1Id: string; team2Player2Id: string;
    roundNumber: number; gameType: string;
  }) => {
    const id = uuid();
    run(`INSERT INTO games (id, sessionId, courtNumber, team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id, status, roundNumber, gameType)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [id, game.sessionId, game.courtNumber, game.team1Player1Id, game.team1Player2Id, game.team2Player1Id, game.team2Player2Id, game.roundNumber, game.gameType]);
    return { id, ...game, status: 'pending' as const };
  });

  ipcMain.handle('games:start', (_e, id: string) => {
    run("UPDATE games SET status = 'playing', startedAt = ? WHERE id = ?",
      [new Date().toISOString(), id]);
  });

  ipcMain.handle('games:complete', (_e, id: string) => {
    run("UPDATE games SET status = 'completed', endedAt = ? WHERE id = ?",
      [new Date().toISOString(), id]);
  });

  ipcMain.handle('games:delete', (_e, id: string) => {
    run('DELETE FROM games WHERE id = ? AND status = ?', [id, 'pending']);
  });

  ipcMain.handle('games:maxRound', (_e, sessionId: string) => {
    const row = queryOne<{ maxRound: number | null }>('SELECT MAX(roundNumber) as maxRound FROM games WHERE sessionId = ?', [sessionId]);
    return row?.maxRound ?? 0;
  });

  // ── Payments ──
  ipcMain.handle('payments:listBySession', (_e, sessionId: string) => {
    return queryAll(
      'SELECT py.*, p.name as playerName FROM payments py JOIN players p ON py.playerId = p.id WHERE py.sessionId = ? ORDER BY py.paymentType, p.name',
      [sessionId]
    );
  });

  ipcMain.handle('payments:listUnpaid', () => {
    return queryAll(
      "SELECT py.*, p.name as playerName, p.phone FROM payments py JOIN players p ON py.playerId = p.id WHERE py.status = 'unpaid' AND py.paymentType = 'session' ORDER BY py.paidDate DESC"
    );
  });

  ipcMain.handle('payments:markPaid', (_e, id: string) => {
    run('UPDATE payments SET status = ?, paidDate = ? WHERE id = ?',
      ['paid', new Date().toISOString(), id]);
  });

  ipcMain.handle('payments:topup', (_e, playerId: string, amount: number) => {
    const now = new Date().toISOString();
    run('INSERT INTO payments (id, playerId, sessionId, amount, status, paidDate, paymentType) VALUES (?, ?, NULL, ?, ?, ?, ?)',
      [uuid(), playerId, amount, 'paid', now, 'topup']);
    run('UPDATE balances SET balance = balance + ?, lastUpdated = ? WHERE playerId = ?',
      [amount, now, playerId]);
  });

  // ── Balances ──
  ipcMain.handle('balances:get', (_e, playerId: string) => {
    const row = queryOne<{ balance: number }>('SELECT balance FROM balances WHERE playerId = ?', [playerId]);
    return row?.balance ?? 0;
  });

  ipcMain.handle('balances:listLow', (_e, threshold: number) => {
    return queryAll(
      'SELECT b.*, p.name as playerName, p.phone FROM balances b JOIN players p ON b.playerId = p.id WHERE b.balance < ? ORDER BY b.balance ASC',
      [threshold]
    );
  });

  // ── History ──
  ipcMain.handle('history:playerStats', (_e, playerId: string) => {
    const sessionRow = queryOne<{ count: number }>('SELECT COUNT(DISTINCT sessionId) as count FROM attendance WHERE playerId = ?', [playerId]);
    const gameRow = queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM games WHERE (team1Player1Id = ? OR team1Player2Id = ? OR team2Player1Id = ? OR team2Player2Id = ?) AND status = ?',
      [playerId, playerId, playerId, playerId, 'completed']
    );
    return { sessionCount: sessionRow?.count ?? 0, gameCount: gameRow?.count ?? 0 };
  });

  // Ensure db reference is used
  void db;
}
