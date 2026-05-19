import { ipcMain, BrowserWindow, dialog, app } from 'electron';
import { v4 as uuid } from 'uuid';
import { SqlValue } from 'sql.js';
import { initDb, run, queryAll, queryOne, transaction } from './database';
import {
  buildNextKnockoutMatches,
  computeTournamentStandings,
  generateKnockoutMatches,
  generateRoundRobinMatches,
  validateTournamentRegistration,
  type TournamentMatchRecord,
  type TournamentRegistration,
} from './tournament';
import fs from 'fs';

export async function registerIpcHandlers() {
  await initDb();

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
    const ALLOWED = new Set(['name', 'gender', 'level', 'phone', 'email']);
    const sets: string[] = [];
    const vals: SqlValue[] = [];
    const formatted: Record<string, SqlValue> = { ...data };
    if (formatted.name) formatted.name = titleCase(String(formatted.name).trim());
    for (const [k, v] of Object.entries(formatted)) {
      if (!ALLOWED.has(k)) continue;
      sets.push(`${k} = ?`);
      vals.push(v as SqlValue);
    }
    if (sets.length === 0) return;
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
    return id;
  });

  ipcMain.handle('sessions:end', (_e, id: string) => {
    run("UPDATE sessions SET endTime = ?, status = 'completed' WHERE id = ?",
      [new Date().toISOString(), id]);
  });

  // ── Attendance ──
  ipcMain.handle('attendance:checkin', (_e, playerId: string, sessionId: string, paymentMethod: 'credit' | 'cash') => {
    const id = uuid();
    const checkinTime = new Date().toISOString();
    const fee = queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'sessionFee'");
    const sessionFee = Number(fee?.value ?? 10);

    return transaction(() => {
      try {
        run('INSERT INTO attendance (id, playerId, sessionId, checkinTime) VALUES (?, ?, ?, ?)',
          [id, playerId, sessionId, checkinTime]);
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('UNIQUE')) return null;
        throw err;
      }

      if (paymentMethod === 'credit') {
        const balance = queryOne<{ balance: number }>('SELECT balance FROM balances WHERE playerId = ?', [playerId]);
        if (!balance || balance.balance < sessionFee) {
          throw new Error('Insufficient balance');
        }
        run('UPDATE balances SET balance = balance - ?, lastUpdated = ? WHERE playerId = ?',
          [sessionFee, checkinTime, playerId]);
        run('INSERT INTO payments (id, playerId, sessionId, amount, status, paidDate, paymentType, paymentMethod) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [uuid(), playerId, sessionId, sessionFee, 'paid', checkinTime, 'session', 'credit']);
      } else {
        run('INSERT INTO payments (id, playerId, sessionId, amount, status, paidDate, paymentType, paymentMethod) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [uuid(), playerId, sessionId, sessionFee, 'paid', checkinTime, 'session', 'cash']);
      }
      return { id, playerId, sessionId, checkinTime };
    });
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
    transaction(() => {
      const att = queryOne<{ playerId: string; sessionId: string }>('SELECT playerId, sessionId FROM attendance WHERE id = ?', [id]);
      if (att) {
        const payment = queryOne<{ id: string; paymentMethod: string; amount: number }>(
          "SELECT id, paymentMethod, amount FROM payments WHERE playerId = ? AND sessionId = ? AND paymentType = 'session'",
          [att.playerId, att.sessionId]
        );
        if (payment) {
          if (payment.paymentMethod === 'credit') {
            run('UPDATE balances SET balance = balance + ?, lastUpdated = ? WHERE playerId = ?',
              [payment.amount, new Date().toISOString(), att.playerId]);
          }
          run('DELETE FROM payments WHERE id = ?', [payment.id]);
        }
      }
      run('DELETE FROM attendance WHERE id = ?', [id]);
    });
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
    app.quit();
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

    // Active session check-in stats
    let sessionStats: { checkinCount: number; maleCount: number; femaleCount: number; creditCount: number; cashCount: number } | null = null;
    if (activeSession) {
      const attRow = queryOne<{ checkinCount: number; maleCount: number; femaleCount: number }>(
        `SELECT COUNT(*) as checkinCount,
                SUM(CASE WHEN p.gender = 'male' THEN 1 ELSE 0 END) as maleCount,
                SUM(CASE WHEN p.gender = 'female' THEN 1 ELSE 0 END) as femaleCount
         FROM attendance a JOIN players p ON a.playerId = p.id WHERE a.sessionId = ?`,
        [activeSession.id]
      );
      const payRow = queryOne<{ creditCount: number; cashCount: number }>(
        `SELECT SUM(CASE WHEN paymentMethod = 'credit' THEN 1 ELSE 0 END) as creditCount,
                SUM(CASE WHEN paymentMethod = 'cash' THEN 1 ELSE 0 END) as cashCount
         FROM payments WHERE sessionId = ? AND paymentType = 'session'`,
        [activeSession.id]
      );
      sessionStats = {
        checkinCount: attRow?.checkinCount ?? 0,
        maleCount: attRow?.maleCount ?? 0,
        femaleCount: attRow?.femaleCount ?? 0,
        creditCount: payRow?.creditCount ?? 0,
        cashCount: payRow?.cashCount ?? 0,
      };
    }

    return {
      playerCount,
      sessionCount,
      gamesPlayed,
      avgDurationMin: avgRow?.avg ?? null,
      activeSession,
      sessionStats,
      recentSessions: recentSessions.map(s => {
        const duration = s.startTime && s.endTime
          ? Math.round((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000)
          : null;
        return { ...s, durationMin: duration };
      }),
    };
  });

  // ── CSV Helpers ──
  function csvField(value: string | number): string {
    const s = String(value);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function parseCsvRow(line: string): string[] {
    const fields: string[] = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        let field = '';
        i++; // skip opening quote
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { field += '"'; i += 2; }
          else if (line[i] === '"') { i++; break; }
          else { field += line[i++]; }
        }
        if (line[i] === ',') i++;
        fields.push(field);
      } else {
        const end = line.indexOf(',', i);
        if (end === -1) { fields.push(line.slice(i)); break; }
        fields.push(line.slice(i, end));
        i = end + 1;
      }
    }
    return fields;
  }

  // ── Export ──
  ipcMain.handle('export:csv', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return;

    const { filePath, canceled } = await dialog.showSaveDialog(win, {
      title: 'Export Players',
      defaultPath: 'autorally-players.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (canceled || !filePath) return;

    const players = queryAll<{ name: string; gender: string; level: number; phone: string; email: string; balance: number }>(
      'SELECT p.name, p.gender, p.level, p.phone, p.email, COALESCE(b.balance, 0) as balance FROM players p LEFT JOIN balances b ON b.playerId = p.id ORDER BY p.name'
    );

    const lines = ['Name,Gender,Level,Phone,Email,Balance'];
    for (const p of players) {
      lines.push([
        csvField(p.name),
        csvField(p.gender === 'male' ? 'Male' : 'Female'),
        csvField(p.level),
        csvField(p.phone),
        csvField(p.email ?? ''),
        csvField(p.balance),
      ].join(','));
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
    const cols = parseCsvRow(header).map(c => c.trim());
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
      const parts = parseCsvRow(lines[i]!).map(c => c.trim());
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
    // Auto-delete expired sessions
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    run('DELETE FROM upcoming_sessions WHERE date < ? OR (date = ? AND time != \'\' AND time < ?)', [today, today, nowTime]);
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

  // ── Report ──
  ipcMain.handle('report:sessionStats', (_e, sessionId: string) => {
    // Players checked in this session
    // All games this session
    const games = queryAll<{
      id: string; status: string; gameType: string; roundNumber: number;
      team1Player1Id: string; team1Player2Id: string;
      team2Player1Id: string; team2Player2Id: string;
    }>('SELECT * FROM games WHERE sessionId = ?', [sessionId]);

    const maxRound = games.reduce((max, g) => Math.max(max, g.roundNumber), 0);

    // Count per player
    const playerStats = new Map<string, {
      playerId: string; name: string; gender: string; level: number;
      played: number; satOut: number; doubles: number; mixed: number;
      totalRounds: number;
    }>();

    // Initialize from checked-in players
    const players = queryAll<{ id: string; name: string; gender: string; level: number }>(
      `SELECT p.id, p.name, p.gender, p.level FROM players p
       JOIN attendance a ON a.playerId = p.id WHERE a.sessionId = ?`, [sessionId]
    );
    const genderMap = new Map(players.map(p => [p.id, p.gender]));
    for (const p of players) {
      playerStats.set(p.id, {
        playerId: p.id, name: p.name, gender: p.gender, level: p.level,
        played: 0, satOut: 0, doubles: 0, mixed: 0,
        totalRounds: maxRound,
      });
    }

    // Count games: mixed = teammate opposite gender, doubles = same gender
    for (const p of players) {
      let played = 0;
      let doubles = 0;
      let mixed = 0;
      for (const g of games) {
        const ids = [g.team1Player1Id, g.team1Player2Id, g.team2Player1Id, g.team2Player2Id];
        if (!ids.includes(p.id)) continue;
        played++;
        // Find teammate: the other player on the same team
        const inTeam1 = g.team1Player1Id === p.id || g.team1Player2Id === p.id;
        const teammateId = inTeam1
          ? (g.team1Player1Id === p.id ? g.team1Player2Id : g.team1Player1Id)
          : (g.team2Player1Id === p.id ? g.team2Player2Id : g.team2Player1Id);
        if (genderMap.get(teammateId) === p.gender) doubles++;
        else mixed++;
      }
      const stat = playerStats.get(p.id)!;
      stat.played = played;
      stat.satOut = Math.max(0, maxRound - played);
      stat.doubles = doubles;
      stat.mixed = mixed;
    }

    return {
      maxRound,
      players: [...playerStats.values()],
    };
  });

  // ── Tournaments ──

  ipcMain.handle('tournaments:list', () => {
    return queryAll('SELECT t.*, (SELECT COUNT(*) FROM tournament_registrations tr WHERE tr.tournamentId = t.id) as registrationCount FROM tournaments t ORDER BY t.date DESC');
  });

  ipcMain.handle('tournaments:get', (_e, id: string) => {
    const t = queryOne<any>('SELECT *, (SELECT COUNT(*) FROM tournament_registrations WHERE tournamentId = id) as registrationCount FROM tournaments WHERE id = ?', [id]);
    if (!t) return null;
    const roundOrderSql = `
      CASE
        WHEN round GLOB 'R[0-9]*' THEN CAST(substr(round, 2) AS INTEGER)
        WHEN round = 'QF' THEN 9997
        WHEN round = 'SF' THEN 9998
        WHEN round = 'F' THEN 9999
        ELSE 10000
      END`;
    const rounds = queryAll<{ round: string }>(`SELECT DISTINCT round FROM tournament_matches WHERE tournamentId = ? ORDER BY ${roundOrderSql}`, [id]);
    const matches = queryAll<any>(
      `SELECT m.*,
        p1.name as t1p1Name, p1.gender as t1p1Gender, p1.level as t1p1Level,
        p1b.name as t1p2Name, p1b.gender as t1p2Gender, p1b.level as t1p2Level,
        p2.name as t2p1Name, p2.gender as t2p1Gender, p2.level as t2p1Level,
        p2b.name as t2p2Name, p2b.gender as t2p2Gender, p2b.level as t2p2Level
       FROM tournament_matches m
       LEFT JOIN players p1 ON m.team1Player1Id = p1.id
       LEFT JOIN players p1b ON m.team1Player2Id = p1b.id
       LEFT JOIN players p2 ON m.team2Player1Id = p2.id
       LEFT JOIN players p2b ON m.team2Player2Id = p2b.id
       WHERE m.tournamentId = ? ORDER BY ${roundOrderSql}, m.matchNumber`, [id]
    );
    return { ...t, rounds: rounds.map(r => r.round), matches };
  });

  ipcMain.handle('tournaments:create', (_e, data: { name: string; description?: string; date: string; format: string; courtCount?: number }) => {
    const id = uuid();
    const now = new Date().toISOString();
    run('INSERT INTO tournaments (id, name, description, date, format, status, courtCount, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, data.name, data.description ?? '', data.date, data.format, 'upcoming', data.courtCount ?? 4, now]);
    return { id, ...data, description: data.description ?? '', status: 'upcoming' as const, courtCount: data.courtCount ?? 4, createdAt: now };
  });

  ipcMain.handle('tournaments:update', (_e, id: string, data: { name?: string; description?: string; date?: string; format?: string; courtCount?: number }) => {
    const sets: string[] = [];
    const vals: SqlValue[] = [];
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v as SqlValue); }
    }
    if (sets.length > 0) { vals.push(id); run(`UPDATE tournaments SET ${sets.join(', ')} WHERE id = ?`, vals); }
  });

  ipcMain.handle('tournaments:delete', (_e, id: string) => {
    run('DELETE FROM tournament_standings WHERE tournamentId = ?', [id]);
    run('DELETE FROM tournament_matches WHERE tournamentId = ?', [id]);
    run('DELETE FROM tournament_registrations WHERE tournamentId = ?', [id]);
    run('DELETE FROM tournaments WHERE id = ?', [id]);
  });

  ipcMain.handle('tournaments:registrations', (_e, tournamentId: string) => {
    return queryAll(
      `SELECT tr.*, p1.name as player1Name, p1.gender as player1Gender, p1.level as player1Level,
         p2.name as player2Name, p2.gender as player2Gender, p2.level as player2Level
       FROM tournament_registrations tr
       JOIN players p1 ON tr.player1Id = p1.id
       LEFT JOIN players p2 ON tr.player2Id = p2.id
       WHERE tr.tournamentId = ? ORDER BY tr.registeredAt`, [tournamentId]
    );
  });

  ipcMain.handle('tournaments:register', (_e, tournamentId: string, player1Id: string, player2Id?: string) => {
    const existing = queryAll<TournamentRegistration>(
      `SELECT tr.id, tr.player1Id, p1.level as player1Level, tr.player2Id, p2.level as player2Level
       FROM tournament_registrations tr
       JOIN players p1 ON tr.player1Id = p1.id
       LEFT JOIN players p2 ON tr.player2Id = p2.id
       WHERE tr.tournamentId = ?`, [tournamentId]
    );
    validateTournamentRegistration(existing, player1Id, player2Id);

    const id = uuid();
    run('INSERT INTO tournament_registrations (id, tournamentId, player1Id, player2Id, registeredAt) VALUES (?, ?, ?, ?, ?)',
      [id, tournamentId, player1Id, player2Id ?? null, new Date().toISOString()]);
    return { id, tournamentId, player1Id, player2Id: player2Id ?? null };
  });

  ipcMain.handle('tournaments:unregister', (_e, id: string) => {
    run('DELETE FROM tournament_registrations WHERE id = ?', [id]);
  });

  function insertTournamentMatch(match: TournamentMatchRecord) {
    run(
      `INSERT INTO tournament_matches (
        id, tournamentId, round, matchNumber, courtNumber, status,
        team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id,
        team1Score, team2Score, winner, completedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        match.id,
        match.tournamentId,
        match.round,
        match.matchNumber,
        match.courtNumber,
        match.status,
        match.team1Player1Id,
        match.team1Player2Id,
        match.team2Player1Id,
        match.team2Player2Id,
        match.team1Score,
        match.team2Score,
        match.winner,
        match.completedAt,
      ],
    );
  }

  ipcMain.handle('tournaments:generateBracket', (_e, tournamentId: string) => {
    // Delete existing matches for this tournament
    run('DELETE FROM tournament_matches WHERE tournamentId = ?', [tournamentId]);
    run('DELETE FROM tournament_standings WHERE tournamentId = ?', [tournamentId]);

    const t = queryOne<{ format: string; courtCount: number }>('SELECT format, courtCount FROM tournaments WHERE id = ?', [tournamentId]);
    if (!t) return [];

    const regs = queryAll<TournamentRegistration>(
      `SELECT tr.*, p1.name as player1Name, p1.gender as player1Gender, p1.level as player1Level,
         p2.name as player2Name, p2.gender as player2Gender, p2.level as player2Level
       FROM tournament_registrations tr
       JOIN players p1 ON tr.player1Id = p1.id
       LEFT JOIN players p2 ON tr.player2Id = p2.id
       WHERE tr.tournamentId = ?`, [tournamentId]
    );

    if (regs.length < 2) return [];

    const matches = t.format === 'knockout'
      ? generateKnockoutMatches(tournamentId, regs, uuid)
      : generateRoundRobinMatches(tournamentId, regs, t.courtCount, uuid);
    for (const match of matches) insertTournamentMatch(match);
    return matches;
  });

  ipcMain.handle('tournaments:setScore', (_e, matchId: string, team1Score: number, team2Score: number) => {
    const winner = team1Score > team2Score ? 'team1' : 'team2';
    run('UPDATE tournament_matches SET team1Score = ?, team2Score = ?, winner = ?, status = \'completed\', completedAt = ? WHERE id = ?',
      [team1Score, team2Score, winner, new Date().toISOString(), matchId]);
    return { winner };
  });

  ipcMain.handle('tournaments:advanceWinners', (_e, tournamentId: string, currentRound: string) => {
    const tournament = queryOne<{ format: string }>('SELECT format FROM tournaments WHERE id = ?', [tournamentId]);
    if (tournament?.format !== 'knockout') return [];

    const currentRoundMatches = queryAll<TournamentMatchRecord>(
      'SELECT * FROM tournament_matches WHERE tournamentId = ? AND round = ?',
      [tournamentId, currentRound]
    );
    const existingMatches = queryAll<TournamentMatchRecord>(
      'SELECT * FROM tournament_matches WHERE tournamentId = ? AND round <> ?',
      [tournamentId, currentRound]
    );
    const newMatches = buildNextKnockoutMatches(tournamentId, currentRound, currentRoundMatches, existingMatches, uuid);
    for (const match of newMatches) insertTournamentMatch(match);
    return newMatches;
  });

  ipcMain.handle('tournaments:standings', (_e, tournamentId: string) => {
    const matches = queryAll<TournamentMatchRecord>(
      'SELECT * FROM tournament_matches WHERE tournamentId = ? AND status = \'completed\'',
      [tournamentId]
    );
    const result = computeTournamentStandings(matches);
    // Add names
    return result.map(s => {
      const p1 = queryOne<{ name: string }>('SELECT name FROM players WHERE id = ?', [s.player1Id]);
      const p2 = s.player2Id ? queryOne<{ name: string }>('SELECT name FROM players WHERE id = ?', [s.player2Id]) : null;
      return {
        ...s,
        player1Name: p1?.name ?? '?',
        player2Name: p2?.name ?? null,
        diff: s.pf - s.pa,
      };
    });
  });

}
