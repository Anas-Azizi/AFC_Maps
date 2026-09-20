/**
 * تنزيل بلاطات خريطة OSM وتخزينها في أرشيف SQLite متوافق مع osmdroid.
 *
 * التشغيل: npm run tilegen
 *
 * - يحسب نطاق البيانات (bbox) من قاعدة البيانات: المحلات + مضلعات المناطق + هامش صغير.
 * - المستويات 10..14 لكامل النطاق، والمستوى 15 فقط داخل مدينة حلب.
 * - يحترم سياسة استخدام بلاطات OSM: User-Agent واضح، طلبان متزامنان كحد أقصى،
 *   300ms بين الطلبات، إعادة محاولة مع backoff، واستئناف (تخطي البلاطات الموجودة).
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'tiles');
const OUT_FILE = path.join(OUT_DIR, 'offline.sqlite');

const USER_AGENT = 'RepguideApp/0.1 (company internal tool)';
const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
const MAX_TILES = 15000;
const FULL_ZOOMS = [10, 11, 12, 13, 14];
const CITY_ZOOM = 15;
const MARGIN = 0.02; // درجات حول نطاق البيانات
// نطاق مدينة حلب للمستوى 15
const CITY_BBOX = [36.13, 37.05, 36.30, 37.28]; // [minLat, minLng, maxLat, maxLng]

const CONCURRENCY = 2;
const REQUEST_GAP_MS = 300;
const MAX_RETRIES = 4;

function lngToX(lng, z) {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}
function latToY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

function tileRange(bbox, z) {
  const [minLat, minLng, maxLat, maxLng] = bbox;
  const max = 2 ** z - 1;
  const x0 = Math.max(0, Math.min(max, lngToX(minLng, z)));
  const x1 = Math.max(0, Math.min(max, lngToX(maxLng, z)));
  const y0 = Math.max(0, Math.min(max, latToY(maxLat, z))); // خط العرض الأعلى = y أصغر
  const y1 = Math.max(0, Math.min(max, latToY(minLat, z)));
  return { z, x0, x1, y0, y1, count: (x1 - x0 + 1) * (y1 - y0 + 1) };
}

/** مفتاح البلاطة كما في osmdroid SqlTileWriter: ((z << z) + x << z) + y */
function tileKey(z, x, y) {
  const p = 2 ** z;
  return (z * p + x) * p + y;
}

function computeBbox() {
  const row = db.prepare('SELECT MIN(lat) mn, MAX(lat) mx, MIN(lng) ml, MAX(lng) mg FROM stores').get();
  let minLat = row.mn ?? 90, maxLat = row.mx ?? -90, minLng = row.ml ?? 180, maxLng = row.mg ?? -180;
  for (const r of db.prepare('SELECT polygon FROM regions WHERE polygon IS NOT NULL').all()) {
    try {
      for (const [lat, lng] of JSON.parse(r.polygon)) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }
    } catch { /* تجاهل المضلعات التالفة */ }
  }
  return [
    minLat - MARGIN,
    minLng - MARGIN,
    maxLat + MARGIN,
    maxLng + MARGIN,
  ].map((v) => Math.round(v * 10000) / 10000);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchTile(z, x, y) {
  let delay = 1000;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(TILE_URL(z, x, y), {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(30000),
      });
      if (resp.status === 404) return null; // بلاطة غير موجودة (بحر مثلاً)
      if (resp.status === 429 || resp.status >= 500) {
        console.warn(`  ${z}/${x}/${y}: HTTP ${resp.status}، إعادة المحاولة ${attempt}/${MAX_RETRIES}`);
        await sleep(delay);
        delay *= 2;
        continue;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length < 100) throw new Error(`حجم صغير مشبوه (${buf.length} بايت)`);
      return buf;
    } catch (e) {
      if (attempt === MAX_RETRIES) throw e;
      console.warn(`  ${z}/${x}/${y}: ${e.message}، إعادة المحاولة ${attempt}/${MAX_RETRIES}`);
      await sleep(delay);
      delay *= 2;
    }
  }
  return null;
}

async function main() {
  const bbox = computeBbox();
  console.log(`نطاق البيانات (bbox): [${bbox.join(', ')}] (minLat, minLng, maxLat, maxLng)`);

  // بناء خطة المستويات مع تقليل تلقائي إن تجاوز التقدير الحد الأقصى
  let fullZooms = [...FULL_ZOOMS];
  let cityZoom = CITY_ZOOM;
  let plan;
  for (;;) {
    plan = fullZooms.map((z) => tileRange(bbox, z));
    if (cityZoom) plan.push(tileRange(CITY_BBOX, cityZoom));
    const total = plan.reduce((s, r) => s + r.count, 0);
    console.log(
      'التقدير: ' +
        plan.map((r) => `z${r.z}=${r.count}`).join(' + ') +
        ` = ${total} بلاطة`
    );
    if (total <= MAX_TILES) break;
    if (cityZoom) {
      cityZoom = 0;
      console.log(`التقدير ${total} يتجاوز ${MAX_TILES} — إسقاط مستوى المدينة z${CITY_ZOOM}`);
    } else if (fullZooms.length > 1) {
      const dropped = fullZooms.pop();
      console.log(`التقدير ${total} يتجاوز ${MAX_TILES} — إسقاط المستوى z${dropped}`);
    } else {
      console.warn(`تحذير: التقدير ${total} يتجاوز ${MAX_TILES} لكن لا يمكن التقليل أكثر`);
      break;
    }
  }

  const totalPlanned = plan.reduce((s, r) => s + r.count, 0);
  const zooms = plan.map((r) => r.z);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = new DatabaseSync(OUT_FILE);
  out.exec(`
    CREATE TABLE IF NOT EXISTS tiles (
      key INTEGER PRIMARY KEY,
      provider TEXT,
      tile BLOB,
      expires INTEGER
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // استئناف: تخطي البلاطات الموجودة مسبقاً
  const existing = new Set(out.prepare('SELECT key FROM tiles').all().map((r) => Number(r.key)));
  console.log(`موجود مسبقاً في الأرشيف: ${existing.size} بلاطة`);

  const pending = [];
  for (const r of plan) {
    for (let x = r.x0; x <= r.x1; x++) {
      for (let y = r.y0; y <= r.y1; y++) {
        const key = tileKey(r.z, x, y);
        if (!existing.has(key)) pending.push({ z: r.z, x, y, key });
      }
    }
  }
  console.log(`المطلوب تنزيله الآن: ${pending.length} من أصل ${totalPlanned}`);

  const insert = out.prepare('INSERT OR REPLACE INTO tiles (key, provider, tile, expires) VALUES (?, ?, ?, ?)');
  const expires = Date.now() + 365 * 24 * 3600 * 1000;
  let done = 0;
  let failed = 0;
  const startedAt = Date.now();

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    const t0 = Date.now();
    const results = await Promise.all(
      batch.map(async (t) => {
        try {
          const blob = await fetchTile(t.z, t.x, t.y);
          return { t, blob };
        } catch (e) {
          console.error(`  فشل نهائي ${t.z}/${t.x}/${t.y}: ${e.message}`);
          return { t, blob: null };
        }
      })
    );
    for (const { t, blob } of results) {
      if (blob) insert.run(t.key, 'MAPNIK', blob, expires);
      else failed++;
      done++;
    }
    if (done % 100 < CONCURRENCY) {
      const rate = done / ((Date.now() - startedAt) / 1000);
      const remaining = Math.round((pending.length - done) / Math.max(rate, 0.01) / 60);
      console.log(`تقدم: ${done}/${pending.length} (فشل ${failed}) — المتبقي ~${remaining} دقيقة`);
    }
    const elapsed = Date.now() - t0;
    if (elapsed < REQUEST_GAP_MS) await sleep(REQUEST_GAP_MS - elapsed);
  }

  out.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('bbox', JSON.stringify(bbox));
  out.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('zooms', JSON.stringify(zooms));
  out.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('generated_at', new Date().toISOString());

  // تحقق
  const count = out.prepare('SELECT COUNT(*) c FROM tiles').get().c;
  const sample = out.prepare('SELECT tile FROM tiles LIMIT 1').get();
  const magic = sample ? [...sample.tile.subarray(0, 4)] : [];
  const isPng = magic[0] === 0x89 && magic[1] === 0x50;
  const isJpg = magic[0] === 0xff && magic[1] === 0xd8;
  const sizeMB = (fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(1);
  out.close();

  console.log('—'.repeat(40));
  console.log(`اكتمل: ${count} بلاطة في ${OUT_FILE} (${sizeMB} MB)، فشل ${failed}`);
  console.log(`فحص عينة: ${isPng ? 'PNG' : isJpg ? 'JPEG' : 'غير معروف!'} (magic: ${magic.map((b) => b.toString(16)).join(' ')})`);
  if (!isPng && !isJpg) process.exitCode = 1;
}

main().catch((e) => {
  console.error('فشل توليد الحزمة:', e);
  process.exitCode = 1;
});
