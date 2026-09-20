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
