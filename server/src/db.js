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
  account_type TEXT,
  status TEXT,
  map_show INTEGER NOT NULL DEFAULT 1,
  category TEXT,
  shop_class TEXT,
  manager_name TEXT,
  governate TEXT,
  whatsapp TEXT
);

CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  rep_name TEXT,
  invoice_type TEXT,
  visit_day TEXT
);

CREATE INDEX IF NOT EXISTS idx_stores_region ON stores(region_id);
CREATE INDEX IF NOT EXISTS idx_visits_store ON visits(store_id);

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

// ترحيل قواعد موجودة قبل إضافة الحقول الجديدة: إعادة بناء stores بالمخطط النهائي
// (يغطي الانتقال من المخطط القديم بلا code، ومن مخطط السلات b1..b3)
{
  const cols = db.prepare('PRAGMA table_info(stores)').all();
  if (cols.length && !cols.some((c) => c.name === 'map_show')) {
    const have = new Set(cols.map((c) => c.name));
    const copyCols = ['id', 'name', 'owner_name', 'phone', 'lat', 'lng', 'region_id', 'notes', 'code', 'address']
      .filter((c) => have.has(c));
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
        account_type TEXT,
        status TEXT,
        map_show INTEGER NOT NULL DEFAULT 1,
        category TEXT,
        shop_class TEXT,
        manager_name TEXT,
        governate TEXT,
        whatsapp TEXT
      );
      INSERT INTO stores_new (${copyCols.join(', ')})
        SELECT ${copyCols.join(', ')} FROM stores;
      DROP TABLE stores;
      ALTER TABLE stores_new RENAME TO stores;
      CREATE INDEX IF NOT EXISTS idx_stores_region ON stores(region_id);
      CREATE INDEX IF NOT EXISTS idx_stores_code ON stores(code);
      COMMIT;
    `);
  }
}
db.exec('CREATE INDEX IF NOT EXISTS idx_stores_code ON stores(code)');

// عمود صلاحيات المستخدمين (JSON) — NULL تعني كل الصلاحيات (الوضع الافتراضي)
{
  const ucols = db.prepare('PRAGMA table_info(users)').all();
  if (ucols.length && !ucols.some((c) => c.name === 'permissions')) {
    db.exec('ALTER TABLE users ADD COLUMN permissions TEXT');
  }
}

// أعمدة «الاسم المقترح» و«إلغاء نهائي» في تحديثات المحلات
{
  const scols = db.prepare('PRAGMA table_info(store_updates)').all();
  if (scols.length && !scols.some((c) => c.name === 'new_name')) {
    db.exec('ALTER TABLE store_updates ADD COLUMN new_name TEXT');
  }
  if (scols.length && !scols.some((c) => c.name === 'cancel')) {
    db.exec('ALTER TABLE store_updates ADD COLUMN cancel INTEGER NOT NULL DEFAULT 0');
  }
  if (scols.length && !scols.some((c) => c.name === 'action_at')) {
    db.exec('ALTER TABLE store_updates ADD COLUMN action_at TEXT');
  }
}

// وقت تنفيذ الإجراء على جهاز المندوب (قد يسبق وقت المزامنة عند العمل أوفلاين)
{
  const bcols = db.prepare('PRAGMA table_info(store_submissions)').all();
  if (bcols.length && !bcols.some((c) => c.name === 'action_at')) {
    db.exec('ALTER TABLE store_submissions ADD COLUMN action_at TEXT');
  }
}

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
