import { Router } from 'express';
import { db, getDataVersion } from '../db.js';
import { authRequired } from '../auth.js';

export const dataRouter = Router();

dataRouter.get('/snapshot', authRequired, (req, res) => {
  const regions = db
    .prepare('SELECT id, name, color, polygon, label_lat AS labelLat, label_lng AS labelLng FROM regions ORDER BY name')
    .all()
    .map((r) => ({ ...r, polygon: r.polygon ? JSON.parse(r.polygon) : null }));
  const stores = db
    .prepare(`SELECT id, name, owner_name AS ownerName, phone, whatsapp, lat, lng, region_id AS regionId, notes,
              code, address, account_type AS accountType, status, category,
              shop_class AS shopClass, manager_name AS managerName, governate
              FROM stores WHERE map_show = 1 ORDER BY name`)
    .all();
  const visits = db
    .prepare(`SELECT v.store_id AS storeId, v.rep_name AS repName, v.invoice_type AS invoiceType, v.visit_day AS visitDay
              FROM visits v JOIN stores s ON s.id = v.store_id WHERE s.map_show = 1 ORDER BY v.id`)
    .all();
  const landmarks = db.prepare('SELECT id, name, lat, lng FROM landmarks ORDER BY name').all();
  res.json({ version: getDataVersion(), regions, stores, visits, landmarks });
});

// وقت الإجراء من الجهاز (مللي ثانية) → نص ISO؛ أي قيمة غير صالحة = null
function parseActionAt(v) {
  if (typeof v !== 'number' || !isFinite(v) || v <= 0) return null;
  return new Date(v).toISOString().replace('T', ' ').slice(0, 19);
}

// تسجيل محل جديد ميدانياً من المندوب
dataRouter.post('/submissions', authRequired, (req, res) => {
  const { name, lat, lng, actionAt } = req.body || {};
  if (!name || typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'اسم المحل والإحداثيات مطلوبة' });
  }
  const info = db
    .prepare('INSERT INTO store_submissions (store_name, lat, lng, user_id, action_at) VALUES (?, ?, ?, ?, ?)')
    .run(name.trim(), lat, lng, req.user.id, parseActionAt(actionAt));
  res.status(201).json({ id: info.lastInsertRowid });
});

// تحديث مقترح على محل موجود (موقع جديد و/أو ملاحظة و/أو اسم مقترح و/أو إلغاء نهائي) من المندوب
dataRouter.post('/updates', authRequired, (req, res) => {
  const { storeId, storeName, lat, lng, note, newName, cancel, actionAt } = req.body || {};
  const hasLocation = typeof lat === 'number' && typeof lng === 'number';
  const hasNote = typeof note === 'string' && note.trim().length > 0;
  const hasNewName = typeof newName === 'string' && newName.trim().length > 0;
  const hasCancel = cancel === true;
  if (!storeName || (!hasLocation && !hasNote && !hasNewName && !hasCancel)) {
    return res.status(400).json({ error: 'اسم المحل مع موقع جديد أو ملاحظة أو اسم مقترح أو إلغاء مطلوبة' });
  }
  const info = db
    .prepare('INSERT INTO store_updates (store_id, store_name, new_lat, new_lng, note, new_name, cancel, action_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(storeId ?? null, storeName.trim(), hasLocation ? lat : null, hasLocation ? lng : null,
      hasNote ? note.trim() : null, hasNewName ? newName.trim() : null, hasCancel ? 1 : 0,
      parseActionAt(actionAt), req.user.id);
  res.status(201).json({ id: info.lastInsertRowid });
});
