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
    .prepare('SELECT id, name, owner_name AS ownerName, phone, lat, lng, region_id AS regionId, notes FROM stores ORDER BY name')
    .all();
  res.json({ version: getDataVersion(), regions, stores });
});

// تسجيل محل جديد ميدانياً من المندوب
dataRouter.post('/submissions', authRequired, (req, res) => {
  const { name, lat, lng } = req.body || {};
  if (!name || typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'اسم المحل والإحداثيات مطلوبة' });
  }
  const info = db
    .prepare('INSERT INTO store_submissions (store_name, lat, lng, user_id) VALUES (?, ?, ?, ?)')
    .run(name.trim(), lat, lng, req.user.id);
  res.status(201).json({ id: info.lastInsertRowid });
});

// تحديث مقترح على محل موجود (موقع جديد و/أو ملاحظة) من المندوب
dataRouter.post('/updates', authRequired, (req, res) => {
  const { storeId, storeName, lat, lng, note } = req.body || {};
  const hasLocation = typeof lat === 'number' && typeof lng === 'number';
  const hasNote = typeof note === 'string' && note.trim().length > 0;
  if (!storeName || (!hasLocation && !hasNote)) {
    return res.status(400).json({ error: 'اسم المحل مع موقع جديد أو ملاحظة مطلوبة' });
  }
  const info = db
    .prepare('INSERT INTO store_updates (store_id, store_name, new_lat, new_lng, note, user_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(storeId ?? null, storeName.trim(), hasLocation ? lat : null, hasLocation ? lng : null, hasNote ? note.trim() : null, req.user.id);
  res.status(201).json({ id: info.lastInsertRowid });
});
