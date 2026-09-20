import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, bumpDataVersion, getDataVersion, withTransaction } from './db.js';
import { parseKmz } from './kmz.js';
import { hashPassword } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const kmzPath = process.argv[2] || path.join(__dirname, '..', '..', 'data', 'AFCs16.8.2026.kmz');

if (!fs.existsSync(kmzPath)) {
  console.error(`الملف غير موجود: ${kmzPath}`);
  process.exit(1);
}

// إنشاء مدير افتراضي إن لم يوجد أي مستخدم
const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (userCount === 0) {
  db.prepare('INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)').run(
    'المدير',
    'admin',
    hashPassword('admin123'),
    'admin'
  );
  console.log('أُنشئ حساب المدير: admin / admin123 — غيّر كلمة المرور فوراً من لوحة الإدارة');
}

const parsed = parseKmz(fs.readFileSync(kmzPath));

const apply = () => withTransaction(() => {
  db.exec('DELETE FROM stores');
  db.exec('DELETE FROM regions');
  const insertRegion = db.prepare('INSERT INTO regions (name, polygon, label_lat, label_lng) VALUES (?, ?, ?, ?)');
  const insertStore = db.prepare('INSERT INTO stores (name, lat, lng, region_id) VALUES (?, ?, ?, ?)');
  for (const region of parsed.regions) {
    const info = insertRegion.run(region.name, region.polygon ? JSON.stringify(region.polygon) : null, region.labelLat, region.labelLng);
    for (const store of region.stores) {
      insertStore.run(store.name, store.lat, store.lng, info.lastInsertRowid);
    }
  }
});
apply();
bumpDataVersion();

console.log(`استُوردت ${parsed.stats.regions} منطقة و ${parsed.stats.stores} محلاً و ${parsed.stats.polygons} مضلع حدود`);
if (parsed.stats.unmatchedPolygons.length) {
  console.log('مضلعات بلا مجلد منطقة مطابق:', parsed.stats.unmatchedPolygons.join('، '));
}
console.log(`إصدار البيانات: ${getDataVersion()}`);
