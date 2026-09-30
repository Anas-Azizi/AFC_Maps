import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { db, bumpDataVersion, withTransaction } from '../db.js';
import { authRequired, adminRequired, hashPassword } from '../auth.js';
import { parseKmz } from '../kmz.js';

export const adminRouter = Router();
adminRouter.use(authRequired, adminRequired);

// ---------- المستخدمون ----------

adminRouter.get('/users', (req, res) => {
  const users = db.prepare('SELECT id, name, username, role, active, created_at AS createdAt FROM users ORDER BY name').all();
  res.json(users);
});

adminRouter.post('/users', (req, res) => {
  const { name, username, password, role = 'rep' } = req.body || {};
  if (!name || !username || !password) return res.status(400).json({ error: 'الاسم واسم المستخدم وكلمة المرور مطلوبة' });
  if (!['admin', 'rep'].includes(role)) return res.status(400).json({ error: 'دور غير صالح' });
  try {
    const info = db
      .prepare('INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(name, username, hashPassword(password), role);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
  }
});

adminRouter.put('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, role, active } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (role && !['admin', 'rep'].includes(role)) return res.status(400).json({ error: 'دور غير صالح' });
  db.prepare('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?').run(
    name ?? user.name,
    role ?? user.role,
    active == null ? user.active : active ? 1 : 0,
    id
  );
  res.json({ ok: true });
});

adminRouter.post('/users/:id/reset-password', (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'كلمة المرور مطلوبة' });
  const info = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
  if (!info.changes) return res.status(404).json({ error: 'المستخدم غير موجود' });
  res.json({ ok: true });
});

adminRouter.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'لا يمكنك حذف حسابك' });
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (!info.changes) return res.status(404).json({ error: 'المستخدم غير موجود' });
  res.json({ ok: true });
});

// ---------- المناطق ----------

adminRouter.get('/regions', (req, res) => {
  const regions = db
    .prepare(`SELECT r.id, r.name, r.color, r.polygon, r.label_lat AS labelLat, r.label_lng AS labelLng,
              (SELECT COUNT(*) FROM stores s WHERE s.region_id = r.id) AS storeCount
              FROM regions r ORDER BY r.name`)
    .all()
    .map((r) => ({ ...r, polygon: r.polygon ? JSON.parse(r.polygon) : null }));
  res.json(regions);
});

adminRouter.post('/regions', (req, res) => {
  const { name, color, polygon, labelLat, labelLng } = req.body || {};
  if (!name) return res.status(400).json({ error: 'اسم المنطقة مطلوب' });
  try {
    const info = db
      .prepare('INSERT INTO regions (name, color, polygon, label_lat, label_lng) VALUES (?, ?, ?, ?, ?)')
      .run(name, color ?? null, polygon ? JSON.stringify(polygon) : null, labelLat ?? null, labelLng ?? null);
    bumpDataVersion();
    res.status(201).json({ id: info.lastInsertRowid });
  } catch {
    res.status(409).json({ error: 'اسم المنطقة مستخدم مسبقاً' });
  }
});

adminRouter.put('/regions/:id', (req, res) => {
  const id = Number(req.params.id);
  const region = db.prepare('SELECT * FROM regions WHERE id = ?').get(id);
  if (!region) return res.status(404).json({ error: 'المنطقة غير موجودة' });
  const { name, color, polygon, labelLat, labelLng } = req.body || {};
  db.prepare('UPDATE regions SET name = ?, color = ?, polygon = ?, label_lat = ?, label_lng = ? WHERE id = ?').run(
    name ?? region.name,
    color ?? region.color,
    polygon !== undefined ? (polygon ? JSON.stringify(polygon) : null) : region.polygon,
    labelLat ?? region.label_lat,
    labelLng ?? region.label_lng,
    id
  );
  bumpDataVersion();
  res.json({ ok: true });
});

adminRouter.delete('/regions/:id', (req, res) => {
  const info = db.prepare('DELETE FROM regions WHERE id = ?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'المنطقة غير موجودة' });
  bumpDataVersion();
  res.json({ ok: true });
});

// ---------- المحلات ----------

adminRouter.get('/stores', (req, res) => {
  const { regionId, q } = req.query;
  let sql = 'SELECT id, name, owner_name AS ownerName, phone, lat, lng, region_id AS regionId, notes FROM stores';
  const where = [];
  const params = [];
  if (regionId) { where.push('region_id = ?'); params.push(Number(regionId)); }
  if (q) { where.push('name LIKE ?'); params.push(`%${q}%`); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY name LIMIT 500';
  res.json(db.prepare(sql).all(...params));
});

adminRouter.post('/stores', (req, res) => {
  const { name, ownerName, phone, lat, lng, regionId, notes } = req.body || {};
  if (!name || lat == null || lng == null) return res.status(400).json({ error: 'الاسم والإحداثيات مطلوبة' });
  const info = db
    .prepare('INSERT INTO stores (name, owner_name, phone, lat, lng, region_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(name, ownerName ?? null, phone ?? null, lat, lng, regionId ?? null, notes ?? null);
  bumpDataVersion();
  res.status(201).json({ id: info.lastInsertRowid });
});

adminRouter.put('/stores/:id', (req, res) => {
  const id = Number(req.params.id);
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(id);
  if (!store) return res.status(404).json({ error: 'المحل غير موجود' });
  const { name, ownerName, phone, lat, lng, regionId, notes } = req.body || {};
  db.prepare('UPDATE stores SET name = ?, owner_name = ?, phone = ?, lat = ?, lng = ?, region_id = ?, notes = ? WHERE id = ?').run(
    name ?? store.name,
    ownerName ?? store.owner_name,
    phone ?? store.phone,
    lat ?? store.lat,
    lng ?? store.lng,
    regionId ?? store.region_id,
    notes ?? store.notes,
    id
  );
  bumpDataVersion();
  res.json({ ok: true });
});

adminRouter.delete('/stores/:id', (req, res) => {
  const info = db.prepare('DELETE FROM stores WHERE id = ?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'المحل غير موجود' });
  bumpDataVersion();
  res.json({ ok: true });
});

// ---------- المحلات المسجلة ميدانياً ----------

adminRouter.get('/submissions', (req, res) => {
  const archived = req.query.archived === '1' ? 1 : 0;
  const rows = db
    .prepare(`SELECT s.id, s.store_name AS name, s.lat, s.lng, s.created_at AS createdAt,
              u.name AS userName
              FROM store_submissions s JOIN users u ON u.id = s.user_id
              WHERE s.archived = ? ORDER BY s.created_at DESC`)
    .all(archived);
  res.json(rows);
});

adminRouter.post('/submissions/:id/archive', (req, res) => {
  const id = Number(req.params.id);
  const archived = req.body?.archived ? 1 : 0;
  const info = db.prepare('UPDATE store_submissions SET archived = ? WHERE id = ?').run(archived, id);
  if (!info.changes) return res.status(404).json({ error: 'السجل غير موجود' });
  res.json({ ok: true });
});

// ---------- استيراد KMZ ----------

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
const pendingImports = new Map();

adminRouter.post('/import/kmz', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'الملف مطلوب' });
  let parsed;
  try {
    parsed = parseKmz(req.file.buffer);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const importId = crypto.randomUUID();
  pendingImports.set(importId, { parsed, at: Date.now() });
  setTimeout(() => pendingImports.delete(importId), 10 * 60 * 1000).unref();
  res.json({
    importId,
    stats: parsed.stats,
    regions: parsed.regions.map((r) => ({
      name: r.name,
      storeCount: r.stores.length,
      hasPolygon: !!r.polygon,
    })),
  });
});

adminRouter.post('/import/confirm', (req, res) => {
  const { importId, mode = 'replace' } = req.body || {};
  const pending = pendingImports.get(importId);
  if (!pending) return res.status(400).json({ error: 'جلسة الاستيراد انتهت، أعد رفع الملف' });
  pendingImports.delete(importId);

  const apply = () => withTransaction(() => {
    if (mode === 'replace') {
      db.exec('DELETE FROM stores');
      db.exec('DELETE FROM regions');
    }
    const insertRegion = db.prepare('INSERT INTO regions (name, polygon, label_lat, label_lng) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET polygon = COALESCE(excluded.polygon, regions.polygon), label_lat = COALESCE(excluded.label_lat, regions.label_lat), label_lng = COALESCE(excluded.label_lng, regions.label_lng)');
    const findRegion = db.prepare('SELECT id FROM regions WHERE name = ?');
    const findStore = db.prepare('SELECT id FROM stores WHERE name = ? AND region_id = ?');
    const insertStore = db.prepare('INSERT INTO stores (name, lat, lng, region_id) VALUES (?, ?, ?, ?)');

    for (const region of pending.parsed.regions) {
      insertRegion.run(region.name, region.polygon ? JSON.stringify(region.polygon) : null, region.labelLat, region.labelLng);
      const regionId = findRegion.get(region.name).id;
      for (const store of region.stores) {
        if (mode === 'merge' && findStore.get(store.name, regionId)) continue;
        insertStore.run(store.name, store.lat, store.lng, regionId);
      }
    }
  });
  apply();
  bumpDataVersion();
  res.json({ ok: true, stats: pending.parsed.stats });
});
