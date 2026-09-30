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
