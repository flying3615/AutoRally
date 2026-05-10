import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'autorally-seed.db');

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
    CREATE TABLE games (id TEXT PRIMARY KEY, sessionId TEXT NOT NULL REFERENCES sessions(id), courtNumber INTEGER NOT NULL, team1Player1Id TEXT NOT NULL REFERENCES players(id), team1Player2Id TEXT NOT NULL REFERENCES players(id), team2Player1Id TEXT NOT NULL REFERENCES players(id), team2Player2Id TEXT NOT NULL REFERENCES players(id), status TEXT NOT NULL, roundNumber INTEGER NOT NULL, gameType TEXT NOT NULL, startedAt TEXT, endedAt TEXT);
    CREATE TABLE balances (id TEXT PRIMARY KEY, playerId TEXT NOT NULL UNIQUE REFERENCES players(id), balance REAL NOT NULL DEFAULT 0, lastUpdated TEXT NOT NULL);
    CREATE TABLE payments (id TEXT PRIMARY KEY, playerId TEXT NOT NULL REFERENCES players(id), sessionId TEXT REFERENCES sessions(id), amount REAL NOT NULL, status TEXT NOT NULL, paidDate TEXT, paymentType TEXT NOT NULL);
    INSERT INTO settings (key, value) VALUES ('courtCount', '3');
    INSERT INTO settings (key, value) VALUES ('sessionFee', '30');
    INSERT INTO settings (key, value) VALUES ('gameDuration', '15');
  `);

  // Players — 20 people, mix of gender and levels
  const players = [
    { id: 'p1',  name: '张伟',   gender: 'male',   level: 5, phone: '13800000001', balance: 200 },
    { id: 'p2',  name: '李娜',   gender: 'female', level: 4, phone: '13800000002', balance: 150 },
    { id: 'p3',  name: '王强',   gender: 'male',   level: 4, phone: '13800000003', balance: 120 },
    { id: 'p4',  name: '刘洋',   gender: 'male',   level: 3, phone: '13800000004', balance: 90 },
    { id: 'p5',  name: '陈静',   gender: 'female', level: 3, phone: '13800000005', balance: 60 },
    { id: 'p6',  name: '赵磊',   gender: 'male',   level: 5, phone: '13800000006', balance: 300 },
    { id: 'p7',  name: '孙芳',   gender: 'female', level: 2, phone: '13800000007', balance: 30 },
    { id: 'p8',  name: '周杰',   gender: 'male',   level: 2, phone: '13800000008', balance: 45 },
    { id: 'p9',  name: '吴敏',   gender: 'female', level: 5, phone: '13800000009', balance: 250 },
    { id: 'p10', name: '郑浩',   gender: 'male',   level: 3, phone: '13800000010', balance: 15 },
    { id: 'p11', name: '黄丽',   gender: 'female', level: 4, phone: '13800000011', balance: 80 },
    { id: 'p12', name: '林峰',   gender: 'male',   level: 1, phone: '13800000012', balance: 0 },
    { id: 'p13', name: '何婷',   gender: 'female', level: 1, phone: '13800000013', balance: 10 },
    { id: 'p14', name: '马超',   gender: 'male',   level: 4, phone: '13800000014', balance: 180 },
    { id: 'p15', name: '高雪',   gender: 'female', level: 3, phone: '13800000015', balance: 50 },
    { id: 'p16', name: '罗勇',   gender: 'male',   level: 2, phone: '13800000016', balance: 20 },
    { id: 'p17', name: '谢琳',   gender: 'female', level: 2, phone: '13800000017', balance: 40 },
    { id: 'p18', name: '韩飞',   gender: 'male',   level: 3, phone: '13800000018', balance: 70 },
    { id: 'p19', name: '唐颖',   gender: 'female', level: 5, phone: '13800000019', balance: 160 },
    { id: 'p20', name: '邓鹏',   gender: 'male',   level: 1, phone: '13800000020', balance: 5 },
  ];

  const joinDate = '2025-01-15T10:00:00.000Z';
  for (const p of players) {
    db.run('INSERT INTO players (id, name, gender, level, phone, joinDate) VALUES (?, ?, ?, ?, ?, ?)',
      [p.id, p.name, p.gender, p.level, p.phone, joinDate]);
    db.run('INSERT INTO balances (id, playerId, balance, lastUpdated) VALUES (?, ?, ?, ?)',
      [`b${p.id}`, p.id, p.balance, joinDate]);
  }

  // Completed session from last week
  const sessionId1 = 's1';
  const lastWeek = '2025-05-03';
  db.run('INSERT INTO sessions (id, date, startTime, endTime, courtCount, status) VALUES (?, ?, ?, ?, ?, ?)',
    [sessionId1, lastWeek, `${lastWeek}T09:00:00.000Z`, `${lastWeek}T12:00:00.000Z`, 3, 'completed']);

  // Attendance for completed session — 16 players
  const attendedS1 = players.slice(0, 16);
  for (let i = 0; i < attendedS1.length; i++) {
    const p = attendedS1[i]!;
    const checkinTime = `${lastWeek}T0${8 + Math.floor(i / 4)}:${(i % 4) * 15}:00.000Z`;
    db.run('INSERT INTO attendance (id, playerId, sessionId, checkinTime) VALUES (?, ?, ?, ?)',
      [`a${p.id}_s1`, p.id, sessionId1, checkinTime]);
  }

  // Games for completed session — 2 rounds
  // Round 1 (same-gender): 3 courts
  const round1Games = [
    { id: 'g1', court: 1, t1: ['p1', 'p12'], t2: ['p6', 'p4'] },
    { id: 'g2', court: 2, t1: ['p14', 'p8'], t2: ['p3', 'p16'] },
    { id: 'g3', court: 3, t1: ['p2', 'p13'], t2: ['p9', 'p7'] },
  ];
  for (const g of round1Games) {
    db.run(`INSERT INTO games (id, sessionId, courtNumber, team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id, status, roundNumber, gameType, startedAt, endedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', 1, 'same-gender', ?, ?)`,
      [g.id, sessionId1, g.court, g.t1[0], g.t1[1], g.t2[0], g.t2[1],
       `${lastWeek}T09:15:00.000Z`, `${lastWeek}T09:30:00.000Z`]);
  }

  // Round 2 (mixed): 3 courts
  const round2Games = [
    { id: 'g4', court: 1, t1: ['p1', 'p7'], t2: ['p6', 'p2'] },
    { id: 'g5', court: 2, t1: ['p3', 'p5'], t2: ['p14', 'p9'] },
    { id: 'g6', court: 3, t1: ['p4', 'p13'], t2: ['p8', 'p11'] },
  ];
  for (const g of round2Games) {
    db.run(`INSERT INTO games (id, sessionId, courtNumber, team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id, status, roundNumber, gameType, startedAt, endedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', 2, 'mixed', ?, ?)`,
      [g.id, sessionId1, g.court, g.t1[0], g.t1[1], g.t2[0], g.t2[1],
       `${lastWeek}T09:35:00.000Z`, `${lastWeek}T09:50:00.000Z`]);
  }

  // Payments for completed session
  for (let i = 0; i < attendedS1.length; i++) {
    const p = attendedS1[i]!;
    const paid = p.balance >= 30 || i < 12;
    db.run('INSERT INTO payments (id, playerId, sessionId, amount, status, paidDate, paymentType) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [`py${p.id}_s1`, p.id, sessionId1, 30, paid ? 'paid' : 'unpaid',
       paid ? `${lastWeek}T09:${String(i).padStart(2, '0')}:00.000Z` : null, 'session']);
  }

  // Active session — today
  const sessionId2 = 's2';
  const today = '2025-05-10';
  db.run('INSERT INTO sessions (id, date, startTime, endTime, courtCount, status) VALUES (?, ?, ?, ?, ?, ?)',
    [sessionId2, today, `${today}T14:00:00.000Z`, null, 3, 'active']);

  // Attendance for active session — 12 players so far
  const attendedS2 = players.slice(0, 12);
  for (let i = 0; i < attendedS2.length; i++) {
    const p = attendedS2[i]!;
    const checkinTime = `${today}T13:${45 + Math.floor(i / 4)}:${(i % 4) * 15}:00.000Z`;
    db.run('INSERT INTO attendance (id, playerId, sessionId, checkinTime) VALUES (?, ?, ?, ?)',
      [`a${p.id}_s2`, p.id, sessionId2, checkinTime]);

    // Auto-deduct from balance
    const balance = p.balance;
    if (balance >= 30) {
      db.run('UPDATE balances SET balance = balance - 30, lastUpdated = ? WHERE playerId = ?',
        [checkinTime, p.id]);
      db.run('INSERT INTO payments (id, playerId, sessionId, amount, status, paidDate, paymentType) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [`py${p.id}_s2`, p.id, sessionId2, 30, 'paid', checkinTime, 'session']);
    } else {
      db.run('INSERT INTO payments (id, playerId, sessionId, amount, status, paidDate, paymentType) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [`py${p.id}_s2`, p.id, sessionId2, 30, 'unpaid', null, 'session']);
    }
  }

  // Active games — round 1 playing
  const activeGames = [
    { id: 'g7', court: 1, t1: ['p1', 'p10'], t2: ['p6', 'p4'] },
    { id: 'g8', court: 2, t1: ['p14', 'p8'], t2: ['p3', 'p16'] },
    { id: 'g9', court: 3, t1: ['p2', 'p7'], t2: ['p9', 'p5'] },
  ];
  for (const g of activeGames) {
    db.run(`INSERT INTO games (id, sessionId, courtNumber, team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id, status, roundNumber, gameType, startedAt, endedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'playing', 1, 'same-gender', ?, NULL)`,
      [g.id, sessionId2, g.court, g.t1[0], g.t1[1], g.t2[0], g.t2[1],
       `${today}T14:10:00.000Z`]);
  }

  // Save
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  db.close();

  console.log(`Seed database created at: ${dbPath}`);
  console.log(`  Players: ${players.length}`);
  console.log(`  Sessions: 2 (1 completed, 1 active)`);
  console.log(`  Games: 6 completed + 3 playing`);
  console.log(`  Payments: ~28 records`);

  // Also copy to Electron userData dir so the app can use it
  const electronDbPath = path.join(
    process.env.HOME || '/tmp',
    'Library', 'Application Support', 'autorally', 'autorally.db'
  );
  const dir = path.dirname(electronDbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(dbPath, electronDbPath);
  console.log(`\nCopied to Electron userData: ${electronDbPath}`);
}

seed().catch(console.error);
