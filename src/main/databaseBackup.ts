import type { Database } from 'sql.js';

const REQUIRED_BACKUP_TABLES = [
  'settings',
  'players',
  'sessions',
  'attendance',
  'games',
  'balances',
  'payments',
];

export function validateAutoRallyDatabase(database: Database) {
  const stmt = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'");
  const tables = new Set<string>();
  try {
    while (stmt.step()) {
      const row = stmt.getAsObject() as { name?: string };
      if (row.name) tables.add(row.name);
    }
  } finally {
    stmt.free();
  }

  const missing = REQUIRED_BACKUP_TABLES.filter(table => !tables.has(table));
  if (missing.length > 0) {
    throw new Error(`Selected file is not an AutoRally database backup. Missing: ${missing.join(', ')}`);
  }
}

export function backupFileName(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `autorally-backup-${yyyy}-${mm}-${dd}.db`;
}
