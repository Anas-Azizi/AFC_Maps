import express from 'express';
import { authRequired } from '../auth.js';

// وسيط توجيه إلى محرك OSRM المحلي (منفذ داخلي فقط، لا يُكشف للعامة)
const OSRM_URL = process.env.OSRM_URL || 'http://127.0.0.1:5100';

export const routeRouter = express.Router();

// GET /api/route?from=lng,lat&to=lng,lat
routeRouter.get('/', authRequired, async (req, res) => {
  const parse = (v) => (typeof v === 'string' ? v.split(',').map(Number) : null);
  const f = parse(req.query.from);
  const t = parse(req.query.to);
  const valid = (p) =>
    p && p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
  if (!valid(f) || !valid(t)) {
    return res.status(400).json({ error: 'إحداثيات غير صالحة — الصيغة: from=lng,lat&to=lng,lat' });
  }
  try {
    const url =
      `${OSRM_URL}/route/v1/driving/${f[0]},${f[1]};${t[0]},${t[1]}` +
      '?overview=full&geometries=geojson';
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) throw new Error(`OSRM HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.code !== 'Ok' || !data.routes?.length) {
      return res.status(404).json({ error: 'تعذّر إيجاد مسار بين النقطتين' });
    }
    const r = data.routes[0];
    res.json({
      distance: r.distance, // متر
      duration: r.duration, // ثانية
      points: r.geometry.coordinates, // [lng, lat]
    });
  } catch (e) {
    console.error('فشل طلب التوجيه:', e.message);
    res.status(503).json({ error: 'خدمة التوجيه غير متاحة حالياً' });
  }
});
