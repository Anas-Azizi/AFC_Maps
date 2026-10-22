import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data.sqlite');

export const db = new DatabaseSync(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'rep' CHECK (role IN ('admin','rep')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS regions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  polygon TEXT,
  label_lat REAL,
  label_lng REAL
);

CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_name TEXT,
  phone TEXT,
  lat REAL,
  lng REAL,
  region_id INTEGER REFERENCES regions(id) ON DELETE SET NULL,
  notes TEXT,
  code INTEGER,
  address TEXT,
  b1_rep TEXT, b1_channel TEXT, b1_day TEXT,
  b2_rep TEXT, b2_channel TEXT, b2_day TEXT,
  b3_rep TEXT, b3_channel TEXT, b3_day TEXT
);

CREATE INDEX IF NOT EXISTS idx_stores_region ON stores(region_id);

CREATE TABLE IF NOT EXISTS landmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS store_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS store_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER,
  store_name TEXT NOT NULL,
  new_lat REAL,
  new_lng REAL,
  note TEXT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

// ترحيل قواعد موجودة قبل إضافة الحقول الجديدة: إعادة بناء stores مع الأعمدة الجديدة و lat/lng nullable
{
  const cols = db.prepare('PRAGMA table_info(stores)').all();
  if (cols.length && !cols.some((c) => c.name === 'code')) {
    db.exec(`
      BEGIN;
      CREATE TABLE stores_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        owner_name TEXT,
        phone TEXT,
        lat REAL,
        lng REAL,
        region_id INTEGER REFERENCES regions(id) ON DELETE SET NULL,
        notes TEXT,
        code INTEGER,
        address TEXT,
        b1_rep TEXT, b1_channel TEXT, b1_day TEXT,
        b2_rep TEXT, b2_channel TEXT, b2_day TEXT,
        b3_rep TEXT, b3_channel TEXT, b3_day TEXT
      );
      INSERT INTO stores_new (id, name, owner_name, phone, lat, lng, region_id, notes)
        SELECT id, name, owner_name, phone, lat, lng, region_id, notes FROM stores;
      DROP TABLE stores;
      ALTER TABLE stores_new RENAME TO stores;
      CREATE INDEX IF NOT EXISTS idx_stores_region ON stores(region_id);
      CREATE INDEX IF NOT EXISTS idx_stores_code ON stores(code);
      COMMIT;
    `);
  }
}
db.exec('CREATE INDEX IF NOT EXISTS idx_stores_code ON stores(code)');

export function getDataVersion() {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'data_version'").get();
  return row ? Number(row.value) : 0;
}

export function bumpDataVersion() {
  db.prepare("INSERT INTO meta (key, value) VALUES ('data_version', '0') ON CONFLICT(key) DO NOTHING").run();
  db.prepare("UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'data_version'").run();
}

export function getMeta(key) {
  return db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
}

export function withTransaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function setMeta(key, value) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}
