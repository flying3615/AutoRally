import { ipcMain, BrowserWindow, dialog } from 'electron';
import { v4 as uuid } from 'uuid';
import { SqlValue } from 'sql.js';
import { initDb, run, queryAll, queryOne } from './database';
import fs from 'fs';

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

  // ── Helpers ──
  function titleCase(str: string): string {
    return str.replace(/\b\w/g, c => c.toUpperCase());
  }

  // ── Players ──
  ipcMain.handle('players:list', () => {
    return queryAll('SELECT p.*, COALESCE(b.balance, 0) as balance FROM players p LEFT JOIN balances b ON b.playerId = p.id ORDER BY p.name');
  });

  ipcMain.handle('players:create', (_e, player: { name: string; gender: string; level: number; phone: string; email?: string }) => {
    const id = uuid();
    const joinDate = new Date().toISOString();
    const name = titleCase(player.name.trim());
    run('INSERT INTO players (id, name, gender, level, phone, email, joinDate) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, name, player.gender, player.level, player.phone ?? '', player.email ?? '', joinDate]);
    run('INSERT INTO balances (id, playerId, balance, lastUpdated) VALUES (?, ?, 0, ?)',
      [uuid(), id, joinDate]);
    return { id, name, gender: player.gender, level: player.level, phone: player.phone ?? '', email: player.email ?? '', joinDate };
  });

  ipcMain.handle('players:update', (_e, id: string, data: { name?: string; gender?: string; level?: number; phone?: string; email?: string }) => {
    const sets: string[] = [];
    const vals: SqlValue[] = [];
    const formatted = { ...data };
    if (formatted.name) formatted.name = titleCase(formatted.name.trim());
    for (const [k, v] of Object.entries(formatted)) {
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
    // End any currently active session first — only one active at a time
    run("UPDATE sessions SET endTime = ?, status = 'completed' WHERE status = 'active'",
      [new Date().toISOString()]);

    const id = uuid();
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

  ipcMain.handle('attendance:setPaused', (_e, id: string, paused: boolean) => {
    run('UPDATE attendance SET paused = ? WHERE id = ?', [paused ? 1 : 0, id]);
  });

  ipcMain.handle('attendance:remove', (_e, id: string) => {
    run('DELETE FROM attendance WHERE id = ?', [id]);
  });

  // ── Games ──
  ipcMain.handle('games:listBySession', (_e, sessionId: string) => {
    return queryAll(
      `SELECT g.*,
        p1.name as t1p1Name, p1.gender as t1p1Gender, p1.level as t1p1Level,
        p2.name as t1p2Name, p2.gender as t1p2Gender, p2.level as t1p2Level,
        p3.name as t2p1Name, p3.gender as t2p1Gender, p3.level as t2p1Level,
        p4.name as t2p2Name, p4.gender as t2p2Gender, p4.level as t2p2Level
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

  ipcMain.handle('games:deleteAllPending', (_e, sessionId: string) => {
    run('DELETE FROM games WHERE sessionId = ? AND status = ?', [sessionId, 'pending']);
  });

  ipcMain.handle('games:maxRound', (_e, sessionId: string) => {
    const row = queryOne<{ maxRound: number | null }>('SELECT MAX(roundNumber) as maxRound FROM games WHERE sessionId = ?', [sessionId]);
    return row?.maxRound ?? 0;
  });

  ipcMain.handle('games:replacePlayer', (_e, gameId: string, slot: string, newPlayerId: string) => {
    const validSlots = ['team1Player1Id', 'team1Player2Id', 'team2Player1Id', 'team2Player2Id'];
    if (!validSlots.includes(slot)) throw new Error('Invalid slot');
    run(`UPDATE games SET ${slot} = ? WHERE id = ?`, [newPlayerId, gameId]);
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

  // ── Window controls ──
  ipcMain.handle('window:isFullscreen', () => {
    const win = BrowserWindow.getFocusedWindow();
    return win?.isFullScreen() ?? false;
  });

  ipcMain.handle('window:setFullscreen', (_e, flag: boolean) => {
    const win = BrowserWindow.getFocusedWindow();
    win?.setFullScreen(flag);
  });

  ipcMain.handle('webFrame:zoomIn', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      const factor = win.webContents.getZoomFactor();
      win.webContents.setZoomFactor(Math.min(factor + 0.1, 3));
    }
  });

  ipcMain.handle('webFrame:zoomOut', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      const factor = win.webContents.getZoomFactor();
      win.webContents.setZoomFactor(Math.max(factor - 0.1, 0.5));
    }
  });

  ipcMain.handle('webFrame:zoomReset', () => {
    const win = BrowserWindow.getFocusedWindow();
    win?.webContents.setZoomFactor(1);
  });

  ipcMain.handle('app:quit', () => {
    BrowserWindow.getFocusedWindow()?.close();
  });

  // ── Dashboard stats ──
  ipcMain.handle('dashboard:stats', () => {
    const playerCount = (queryOne<{ c: number }>('SELECT COUNT(*) as c FROM players'))?.c ?? 0;
    const sessionCount = (queryOne<{ c: number }>('SELECT COUNT(*) as c FROM sessions'))?.c ?? 0;
    const activeSession = queryOne<{ id: string; date: string; startTime: string; courtCount: number }>(
      "SELECT id, date, startTime, courtCount FROM sessions WHERE status = 'active' LIMIT 1"
    );

    // Recent completed sessions with duration
    const recentSessions = queryAll<{ id: string; date: string; startTime: string; endTime: string; courtCount: number }>(
      "SELECT id, date, startTime, endTime, courtCount FROM sessions WHERE status = 'completed' ORDER BY date DESC, startTime DESC LIMIT 5"
    );

    // Average duration in minutes
    const avgRow = queryOne<{ avg: number }>(
      "SELECT ROUND(AVG((julianday(endTime) - julianday(startTime)) * 24 * 60)) as avg FROM sessions WHERE status = 'completed' AND startTime IS NOT NULL AND endTime IS NOT NULL"
    );

    // Total games played across completed sessions
    const gamesPlayed = (queryOne<{ c: number }>(
      "SELECT COUNT(*) as c FROM games WHERE status = 'completed'"
    ))?.c ?? 0;

    return {
      playerCount,
      sessionCount,
      gamesPlayed,
      avgDurationMin: avgRow?.avg ?? null,
      activeSession,
      recentSessions: recentSessions.map(s => {
        const duration = s.startTime && s.endTime
          ? Math.round((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000)
          : null;
        return { ...s, durationMin: duration };
      }),
    };
  });

  // ── Export ──
  ipcMain.handle('export:csv', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return;

    const { filePath, canceled } = await dialog.showSaveDialog(win, {
      title: '导出球员数据',
      defaultPath: 'autorally-players.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (canceled || !filePath) return;

    const players = queryAll<{ name: string; gender: string; level: number; phone: string; email: string; balance: number }>(
      'SELECT p.name, p.gender, p.level, p.phone, p.email, COALESCE(b.balance, 0) as balance FROM players p LEFT JOIN balances b ON b.playerId = p.id ORDER BY p.name'
    );

    const lines = ['姓名,性别,水平,电话,邮箱,余额'];
    for (const p of players) {
      lines.push(`${p.name},${p.gender === 'male' ? '男' : '女'},${p.level},${p.phone},${p.email ?? ''},${p.balance}`);
    }
    fs.writeFileSync(filePath, '﻿' + lines.join('\n'), 'utf-8');
  });

  // ── Import ──
  ipcMain.handle('players:importCsv', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { imported: 0, skipped: 0, errors: [] as string[] };

    const { filePaths, canceled } = await dialog.showOpenDialog(win, {
      title: 'Import Players from CSV',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return { imported: 0, skipped: 0, errors: [] as string[] };

    const filePath = filePaths[0]!;
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return { imported: 0, skipped: 0, errors: ['CSV file is empty or has no data rows'] };

    // Detect header: look for columns by name
    const header = lines[0]!.toLowerCase();
    const cols = header.split(',').map(c => c.trim());
    const firstNameIdx = cols.findIndex(c => c.includes('first') && c.includes('name'));
    const lastNameIdx = cols.findIndex(c => c.includes('last') && c.includes('name'));
    const nameIdx = cols.findIndex(c => c === 'name' || c === '姓名');
    const levelIdx = cols.findIndex(c => c === 'level' || c === '水平');
    const genderIdx = cols.findIndex(c => c === 'gender' || c === '性别');
    const emailIdx = cols.findIndex(c => c === 'email' || c === '邮箱');

    if (levelIdx === -1 || genderIdx === -1) {
      return { imported: 0, skipped: 0, errors: ['CSV must have Level and Gender columns'] };
    }
    const hasNameCol = nameIdx !== -1 || (firstNameIdx !== -1 && lastNameIdx !== -1);

    if (!hasNameCol) {
      return { imported: 0, skipped: 0, errors: ['CSV must have Name column, or First name + Last name columns'] };
    }

    // Check existing names
    const existing = queryAll<{ name: string }>('SELECT name FROM players');
    const existingNames = new Set(existing.map(p => p.name.toLowerCase()));

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i]!.split(',').map(c => c.trim());
      try {
        let name: string;
        if (nameIdx !== -1) {
          name = parts[nameIdx]!;
        } else {
          name = [parts[firstNameIdx], parts[lastNameIdx]].filter(Boolean).join(' ').trim();
        }
        name = titleCase(name);
        const level = Number(parts[levelIdx]);
        const genderRaw = parts[genderIdx]!.toLowerCase();
        const gender = genderRaw === 'male' || genderRaw === '男' ? 'male' : 'female';

        if (!name || isNaN(level) || level < 1 || level > 5) {
          errors.push(`Row ${i + 1}: invalid name or level`);
          continue;
        }

        if (existingNames.has(name.toLowerCase())) {
          skipped++;
          continue;
        }

        const email = emailIdx !== -1 ? (parts[emailIdx] ?? '') : '';

        const id = uuid();
        const joinDate = new Date().toISOString();
        run('INSERT INTO players (id, name, gender, level, phone, email, joinDate) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, name, gender, level, '', email, joinDate]);
        run('INSERT INTO balances (id, playerId, balance, lastUpdated) VALUES (?, ?, ?, ?)',
          [uuid(), id, 0, joinDate]);
        existingNames.add(name.toLowerCase());
        imported++;
      } catch {
        errors.push(`Row ${i + 1}: failed to parse`);
      }
    }

    return { imported, skipped, errors };
  });

  // ── Upcoming Sessions ──
  ipcMain.handle('upcomingSessions:list', () => {
    return queryAll('SELECT * FROM upcoming_sessions ORDER BY date, time');
  });

  ipcMain.handle('upcomingSessions:create', (_e, data: { date: string; time: string; note: string }) => {
    const id = uuid();
    run('INSERT INTO upcoming_sessions (id, date, time, note) VALUES (?, ?, ?, ?)',
      [id, data.date, data.time, data.note]);
    return { id, ...data };
  });

  ipcMain.handle('upcomingSessions:update', (_e, id: string, data: { date: string; time: string; note: string }) => {
    run('UPDATE upcoming_sessions SET date = ?, time = ?, note = ? WHERE id = ?',
      [data.date, data.time, data.note, id]);
  });

  ipcMain.handle('upcomingSessions:delete', (_e, id: string) => {
    run('DELETE FROM upcoming_sessions WHERE id = ?', [id]);
  });

  // Ensure db reference is used
  void db;
}
