import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'autorally-seed.db');

function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoStr(d: Date, h: number, m: number) {
  const dt = new Date(d);
  dt.setUTCHours(h, m, 0, 0);
  return dt.toISOString();
}

async function seed() {
  const SQL = await initSqlJs();

  // Remove old seed db
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const db = new SQL.Database();

  // Schema
  db.run('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE players (id TEXT PRIMARY KEY, name TEXT NOT NULL, gender TEXT NOT NULL, level INTEGER NOT NULL, phone TEXT NOT NULL DEFAULT '', joinDate TEXT NOT NULL);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, date TEXT NOT NULL, startTime TEXT, endTime TEXT, courtCount INTEGER NOT NULL DEFAULT 3, status TEXT NOT NULL);
    CREATE TABLE attendance (id TEXT PRIMARY KEY, playerId TEXT NOT NULL REFERENCES players(id), sessionId TEXT NOT NULL REFERENCES sessions(id), checkinTime TEXT NOT NULL, UNIQUE(playerId, sessionId));
    CREATE TABLE games (id TEXT PRIMARY KEY, sessionId TEXT NOT NULL REFERENCES sessions(id), courtNumber INTEGER NOT NULL, team1Player1Id TEXT NOT NULL REFERENCES players(id), team1Player2Id TEXT NOT NULL REFERENCES players(id), team2Player1Id TEXT NOT NULL REFERENCES players(id), team2Player2Id TEXT NOT NULL REFERENCES players(id), status TEXT NOT NULL, roundNumber INTEGER NOT NULL, gameType TEXT NOT NULL CHECK(gameType IN ('mixed', 'male-double', 'female-double', 'open-double')), startedAt TEXT, endedAt TEXT);
    CREATE TABLE balances (id TEXT PRIMARY KEY, playerId TEXT NOT NULL UNIQUE REFERENCES players(id), balance REAL NOT NULL DEFAULT 0, lastUpdated TEXT NOT NULL);
    CREATE TABLE payments (id TEXT PRIMARY KEY, playerId TEXT NOT NULL REFERENCES players(id), sessionId TEXT REFERENCES sessions(id), amount REAL NOT NULL, status TEXT NOT NULL, paidDate TEXT, paymentType TEXT NOT NULL);
    INSERT INTO settings (key, value) VALUES ('courtCount', '4');
    INSERT INTO settings (key, value) VALUES ('sessionFee', '10');
    INSERT INTO settings (key, value) VALUES ('gameDuration', '15');
  `);

  // Dates relative to today so test data always looks fresh
  const now = new Date();
  const today = dateStr(now);
  const lastWeekDate = new Date(now);
  lastWeekDate.setDate(lastWeekDate.getDate() - 7);
  const lastWeek = dateStr(lastWeekDate);

  // Players — loaded from CSV
  const csvPath = path.join(__dirname, '..', 'kapiti_players.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const csvLines = csvContent.trim().split('\n').slice(1); // skip header
  const players = csvLines.map((line, i) => {
    const [first, last, levelStr, genderStr] = line.split(',');
    const name = [first, last].filter(Boolean).join(' ').trim();
    return {
      id: `p${i + 1}`,
      name,
      gender: genderStr.trim() === 'male' ? 'male' : 'female',
      level: Number(levelStr.trim()),
      phone: '',
      balance: Math.floor(Math.random() * 250) + 10,
    };
  });

  const joinDate = isoStr(now, 10, 0);
  for (const p of players) {
    db.run('INSERT INTO players (id, name, gender, level, phone, joinDate) VALUES (?, ?, ?, ?, ?, ?)',
      [p.id, p.name, p.gender, p.level, p.phone, joinDate]);
    db.run('INSERT INTO balances (id, playerId, balance, lastUpdated) VALUES (?, ?, ?, ?)',
      [`b${p.id}`, p.id, p.balance, joinDate]);
  }

  // Completed session from last week
  const sessionId1 = 's1';
  db.run('INSERT INTO sessions (id, date, startTime, endTime, courtCount, status) VALUES (?, ?, ?, ?, ?, ?)',
    [sessionId1, lastWeek, isoStr(lastWeekDate, 9, 0), isoStr(lastWeekDate, 12, 0), 4, 'completed']);

  // Attendance for completed session — 20 players
  const attendedS1 = players.slice(0, 20);
  for (let i = 0; i < attendedS1.length; i++) {
    const p = attendedS1[i]!;
    const checkinTime = isoStr(lastWeekDate, 8 + Math.floor(i / 5), (i % 5) * 12);
    db.run('INSERT INTO attendance (id, playerId, sessionId, checkinTime) VALUES (?, ?, ?, ?)',
      [`a${p.id}_s1`, p.id, sessionId1, checkinTime]);
  }

  // Helper to get player IDs by slice
  const pid = (i: number) => players[i]!.id;

  // Games for completed session — 2 rounds, 4 courts each (always mixed doubles)
  // Round 1: 4 courts, mixed
  const round1Games = [
    { id: 'g1', court: 1, t1: [pid(0), pid(14)], t2: [pid(1), pid(15)] },
    { id: 'g2', court: 2, t1: [pid(2), pid(16)], t2: [pid(3), pid(17)] },
    { id: 'g3', court: 3, t1: [pid(4), pid(18)], t2: [pid(5), pid(19)] },
    { id: 'g4', court: 4, t1: [pid(6), pid(19)], t2: [pid(7), pid(18)] },
  ];
  for (const g of round1Games) {
    db.run(`INSERT INTO games (id, sessionId, courtNumber, team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id, status, roundNumber, gameType, startedAt, endedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', 1, 'mixed', ?, ?)`,
      [g.id, sessionId1, g.court, g.t1[0], g.t1[1], g.t2[0], g.t2[1],
       isoStr(lastWeekDate, 9, 15), isoStr(lastWeekDate, 9, 30)]);
  }

  // Round 2: 4 courts, mixed
  const round2Games = [
    { id: 'g5', court: 1, t1: [pid(0), pid(15)], t2: [pid(3), pid(14)] },
    { id: 'g6', court: 2, t1: [pid(1), pid(17)], t2: [pid(5), pid(16)] },
    { id: 'g7', court: 3, t1: [pid(2), pid(18)], t2: [pid(7), pid(19)] },
    { id: 'g8', court: 4, t1: [pid(4), pid(14)], t2: [pid(6), pid(16)] },
  ];
  for (const g of round2Games) {
    db.run(`INSERT INTO games (id, sessionId, courtNumber, team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id, status, roundNumber, gameType, startedAt, endedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', 2, 'mixed', ?, ?)`,
      [g.id, sessionId1, g.court, g.t1[0], g.t1[1], g.t2[0], g.t2[1],
       isoStr(lastWeekDate, 9, 35), isoStr(lastWeekDate, 9, 50)]);
  }

  // Payments for completed session
  for (let i = 0; i < attendedS1.length; i++) {
    const p = attendedS1[i]!;
    const paid = p.balance >= 10 || i < 12;
    db.run('INSERT INTO payments (id, playerId, sessionId, amount, status, paidDate, paymentType) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [`py${p.id}_s1`, p.id, sessionId1, 10, paid ? 'paid' : 'unpaid',
       paid ? isoStr(lastWeekDate, 9, i) : null, 'session']);
  }

  // Active session — today
  const sessionId2 = 's2';
  db.run('INSERT INTO sessions (id, date, startTime, endTime, courtCount, status) VALUES (?, ?, ?, ?, ?, ?)',
    [sessionId2, today, isoStr(now, 14, 0), null, 4, 'active']);

  // Attendance for active session — 32 players
  const attendedS2 = players.slice(0, 32);
  for (let i = 0; i < attendedS2.length; i++) {
    const p = attendedS2[i]!;
    const checkinTime = isoStr(now, 13, 45 + Math.floor(i / 8) * 3 + (i % 8) * 1);
    db.run('INSERT INTO attendance (id, playerId, sessionId, checkinTime) VALUES (?, ?, ?, ?)',
      [`a${p.id}_s2`, p.id, sessionId2, checkinTime]);

    // Auto-deduct from balance
    if (p.balance >= 10) {
      db.run('UPDATE balances SET balance = balance - 10, lastUpdated = ? WHERE playerId = ?',
        [checkinTime, p.id]);
      db.run('INSERT INTO payments (id, playerId, sessionId, amount, status, paidDate, paymentType) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [`py${p.id}_s2`, p.id, sessionId2, 10, 'paid', checkinTime, 'session']);
    } else {
      db.run('INSERT INTO payments (id, playerId, sessionId, amount, status, paidDate, paymentType) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [`py${p.id}_s2`, p.id, sessionId2, 10, 'unpaid', null, 'session']);
    }
  }

  // Pending games — round 1, 4 courts, all mixed doubles
  const pendingGames = [
    { id: 'g9',  court: 1, t1: [pid(0), pid(20)], t2: [pid(1), pid(21)] },
    { id: 'g10', court: 2, t1: [pid(2), pid(22)], t2: [pid(3), pid(23)] },
    { id: 'g11', court: 3, t1: [pid(4), pid(24)], t2: [pid(5), pid(25)] },
    { id: 'g12', court: 4, t1: [pid(6), pid(26)], t2: [pid(7), pid(27)] },
  ];
  for (const g of pendingGames) {
    db.run(`INSERT INTO games (id, sessionId, courtNumber, team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id, status, roundNumber, gameType, startedAt, endedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 1, 'mixed', NULL, NULL)`,
      [g.id, sessionId2, g.court, g.t1[0], g.t1[1], g.t2[0], g.t2[1]]);
  }

  // Save
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  db.close();

  console.log(`Seed database created at: ${dbPath}`);
  console.log(`  Date: ${today} (last session: ${lastWeek})`);
  console.log(`  Players: ${players.length}`);
  console.log(`  Sessions: 2 (1 completed, 1 active)`);
  console.log(`  Games: 6 completed + 3 pending`);
  console.log(`  Payments: ~28 records`);
}

seed().catch(console.error);
