import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { db, bumpDataVersion, withTransaction } from '../db.js';
import { authRequired, adminRequired, hashPassword } from '../auth.js';
import { parseDistrictsKmz } from '../kmz.js';
import { parseCustomersXlsx, parseRoutesXlsx } from '../xlsx.js';
import { assignRegions } from '../importer.js';

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

const STORE_COLS = `id, name, owner_name AS ownerName, phone, whatsapp, lat, lng,
  region_id AS regionId, notes, code, address, account_type AS accountType, status,
  map_show AS mapShow, category, shop_class AS shopClass, manager_name AS managerName, governate`;

adminRouter.get('/stores', (req, res) => {
  const { regionId, q } = req.query;
  let sql = `SELECT ${STORE_COLS} FROM stores`;
  const where = [];
  const params = [];
  if (regionId) { where.push('region_id = ?'); params.push(Number(regionId)); }
  if (q) {
    where.push('(name LIKE ? OR CAST(code AS TEXT) LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY name LIMIT 500';
  res.json(db.prepare(sql).all(...params));
});

adminRouter.get('/stores/:id', (req, res) => {
  const store = db.prepare(`SELECT ${STORE_COLS} FROM stores WHERE id = ?`).get(Number(req.params.id));
  if (!store) return res.status(404).json({ error: 'المحل غير موجود' });
  const visits = db
    .prepare('SELECT id, rep_name AS repName, invoice_type AS invoiceType, visit_day AS visitDay FROM visits WHERE store_id = ? ORDER BY id')
    .all(store.id);
  res.json({ ...store, visits });
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

const EDITABLE_STORE_FIELDS = {
  name: 'name', ownerName: 'owner_name', phone: 'phone', whatsapp: 'whatsapp',
  lat: 'lat', lng: 'lng', regionId: 'region_id', notes: 'notes', code: 'code',
  address: 'address', accountType: 'account_type', status: 'status',
  category: 'category', shopClass: 'shop_class', managerName: 'manager_name',
  governate: 'governate',
};

adminRouter.put('/stores/:id', (req, res) => {
  const id = Number(req.params.id);
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(id);
  if (!store) return res.status(404).json({ error: 'المحل غير موجود' });
  const body = req.body || {};
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(EDITABLE_STORE_FIELDS)) {
    if (body[key] !== undefined) { sets.push(`${col} = ?`); params.push(body[key]); }
  }
  if (body.mapShow !== undefined) { sets.push('map_show = ?'); params.push(body.mapShow ? 1 : 0); }
  if (!sets.length) return res.status(400).json({ error: 'لا يوجد حقول للتعديل' });
  params.push(id);
  db.prepare(`UPDATE stores SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  bumpDataVersion();
  res.json({ ok: true });
});

adminRouter.delete('/stores/:id', (req, res) => {
  const info = db.prepare('DELETE FROM stores WHERE id = ?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'المحل غير موجود' });
  bumpDataVersion();
  res.json({ ok: true });
});

// ---------- زيارات المندوبين ----------

adminRouter.post('/stores/:id/visits', (req, res) => {
  const storeId = Number(req.params.id);
  if (!db.prepare('SELECT id FROM stores WHERE id = ?').get(storeId)) {
    return res.status(404).json({ error: 'المحل غير موجود' });
  }
  const { repName, invoiceType, visitDay } = req.body || {};
  if (!repName) return res.status(400).json({ error: 'اسم المندوب مطلوب' });
  const info = db
    .prepare('INSERT INTO visits (store_id, rep_name, invoice_type, visit_day) VALUES (?, ?, ?, ?)')
    .run(storeId, repName, invoiceType ?? null, visitDay ?? null);
  bumpDataVersion();
  res.status(201).json({ id: info.lastInsertRowid });
});

adminRouter.put('/visits/:id', (req, res) => {
  const id = Number(req.params.id);
  const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(id);
  if (!visit) return res.status(404).json({ error: 'الزيارة غير موجودة' });
  const { repName, invoiceType, visitDay } = req.body || {};
  db.prepare('UPDATE visits SET rep_name = ?, invoice_type = ?, visit_day = ? WHERE id = ?').run(
    repName ?? visit.rep_name,
    invoiceType !== undefined ? invoiceType : visit.invoice_type,
    visitDay !== undefined ? visitDay : visit.visit_day,
    id
  );
  bumpDataVersion();
  res.json({ ok: true });
});

adminRouter.delete('/visits/:id', (req, res) => {
  const info = db.prepare('DELETE FROM visits WHERE id = ?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'الزيارة غير موجودة' });
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

// ---------- تحديثات المحلات المقترحة ----------

adminRouter.get('/updates', (req, res) => {
  const archived = req.query.archived === '1' ? 1 : 0;
  const rows = db
    .prepare(`SELECT s.id, s.store_id AS storeId, s.store_name AS storeName,
              s.new_lat AS newLat, s.new_lng AS newLng, s.note, s.created_at AS createdAt,
              u.name AS userName
              FROM store_updates s JOIN users u ON u.id = s.user_id
              WHERE s.archived = ? ORDER BY s.created_at DESC`)
    .all(archived);
  res.json(rows);
});

adminRouter.post('/updates/:id/archive', (req, res) => {
  const id = Number(req.params.id);
  const archived = req.body?.archived ? 1 : 0;
  const info = db.prepare('UPDATE store_updates SET archived = ? WHERE id = ?').run(archived, id);
  if (!info.changes) return res.status(404).json({ error: 'السجل غير موجود' });
  res.json({ ok: true });
});

// ---------- استيراد البيانات (KMZ مناطق + Excel زبائن + Excel مسارات) ----------

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
const pendingImports = new Map();

adminRouter.post(
  '/import/files',
  upload.fields([
    { name: 'kmz', maxCount: 1 },
    { name: 'customers', maxCount: 1 },
    { name: 'routes', maxCount: 1 },
  ]),
  (req, res) => {
    const kmzFile = req.files?.kmz?.[0];
    const customersFile = req.files?.customers?.[0];
    const routesFile = req.files?.routes?.[0];
    if (!kmzFile || !customersFile || !routesFile) {
      return res.status(400).json({ error: 'الملفات الثلاثة مطلوبة: KMZ + الزبائن + المسارات' });
    }
    let parsedKmz;
    let parsedCustomers;
    let parsedRoutes;
    try {
      parsedKmz = parseDistrictsKmz(kmzFile.buffer);
    } catch (e) {
      return res.status(400).json({ error: `ملف KMZ: ${e.message}` });
    }
    try {
      parsedCustomers = parseCustomersXlsx(customersFile.buffer);
    } catch (e) {
      return res.status(400).json({ error: `ملف الزبائن: ${e.message}` });
    }
    try {
      parsedRoutes = parseRoutesXlsx(routesFile.buffer);
    } catch (e) {
      return res.status(400).json({ error: `ملف المسارات: ${e.message}` });
    }

    // إسقاط زيارات تشير لأكواد غير موجودة في ملف الزبائن
    const knownCodes = new Set(parsedCustomers.stores.map((s) => s.code).filter((c) => c != null));
    const visits = parsedRoutes.visits.filter((v) => knownCodes.has(v.code));
    const orphanVisits = parsedRoutes.visits.length - visits.length;

    const { regions, stats: assignStats } = assignRegions(parsedCustomers.stores, parsedKmz.regions);

    const importId = crypto.randomUUID();
    pendingImports.set(importId, {
      stores: parsedCustomers.stores,
      visits,
      regions,
      landmarks: parsedKmz.landmarks,
      at: Date.now(),
    });
    setTimeout(() => pendingImports.delete(importId), 10 * 60 * 1000).unref();

    res.json({
      importId,
      stats: {
        regions: regions.length,
        polygons: regions.filter((r) => r.polygon).length,
        landmarks: parsedKmz.landmarks.length,
        stores: parsedCustomers.stats.total,
        storesNoCoords: parsedCustomers.stats.noCoords,
        cancelled: parsedCustomers.stats.cancelled,
        mapShown: parsedCustomers.stats.mapShown,
        visits: visits.length,
        visitCustomers: parsedRoutes.stats.customers,
        orphanVisits,
        assignedByPolygon: assignStats.byPolygon,
        assignedByName: assignStats.byName,
        noRegion: assignStats.noRegion,
      },
      regions: regions.map((r) => ({
        name: r.name,
        storeCount: r.storeCount,
        hasPolygon: !!r.polygon,
      })),
    });
  }
);

adminRouter.post('/import/confirm', (req, res) => {
  const { importId } = req.body || {};
  const pending = pendingImports.get(importId);
  if (!pending) return res.status(400).json({ error: 'جلسة الاستيراد انتهت، أعد رفع الملفات' });
  pendingImports.delete(importId);

  withTransaction(() => {
    db.exec('DELETE FROM visits');
    db.exec('DELETE FROM stores');
    db.exec('DELETE FROM regions');
    db.exec('DELETE FROM landmarks');

    const insertRegion = db.prepare(
      'INSERT INTO regions (name, polygon, label_lat, label_lng) VALUES (?, ?, ?, ?)'
    );
    const regionIds = new Map();
    for (const r of pending.regions) {
      const info = insertRegion.run(
        r.name,
        r.polygon ? JSON.stringify(r.polygon) : null,
        r.labelLat,
        r.labelLng
      );
      regionIds.set(r.name, info.lastInsertRowid);
    }

    const insertLandmark = db.prepare('INSERT INTO landmarks (name, lat, lng) VALUES (?, ?, ?)');
    for (const l of pending.landmarks) insertLandmark.run(l.name, l.lat, l.lng);

    const insertStore = db.prepare(
      `INSERT INTO stores (name, lat, lng, region_id, code, address,
        account_type, status, map_show, category, shop_class, manager_name, governate, phone, whatsapp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const storeIdsByCode = new Map();
    for (const s of pending.stores) {
      const info = insertStore.run(
        s.name, s.lat, s.lng,
        s.regionName ? regionIds.get(s.regionName) ?? null : null,
        s.code, s.address,
        s.accountType, s.status, s.mapShow, s.category, s.shopClass, s.managerName, s.governate,
        s.phone, s.whatsapp
      );
      if (s.code != null) storeIdsByCode.set(s.code, info.lastInsertRowid);
    }

    const insertVisit = db.prepare(
      'INSERT INTO visits (store_id, rep_name, invoice_type, visit_day) VALUES (?, ?, ?, ?)'
    );
    for (const v of pending.visits) {
      const storeId = storeIdsByCode.get(v.code);
      if (storeId != null) insertVisit.run(storeId, v.repName, v.invoiceType, v.visitDay);
    }
  });
  bumpDataVersion();
  res.json({ ok: true });
});
