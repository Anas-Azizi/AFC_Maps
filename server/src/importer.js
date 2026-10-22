import { normalizeName } from './kmz.js';

/** هل النقطة داخل المضلع؟ (ray casting) — polygon: [[lat, lng], ...] */
export function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * يعيّن كل محل لمنطقة: أولاً مكانياً (داخل مضلع)، ثم بمطابقة اسم المنطقة نصياً.
 * المحلات خارج كل المضلعات تُنشأ لها منطقة نصية بلا حدود (تسميتها = مركز محلاتها).
 * يعيد { assignments: Map<storeIndex, regionName>, regions: [...], stats }
 */
export function assignRegions(stores, kmzRegions) {
  // خريطة المناطق بالاسم المطبَّع
  const regionMap = new Map();
  for (const r of kmzRegions) {
    regionMap.set(normalizeName(r.name), {
      name: r.name,
      polygon: r.polygon,
      labelLat: r.labelLat,
      labelLng: r.labelLng,
      storeCount: 0,
      sumLat: 0,
      sumLng: 0,
    });
  }

  const stats = { byPolygon: 0, byName: 0, noRegion: 0 };
  const withPolygon = kmzRegions.filter((r) => r.polygon);

  for (const store of stores) {
    let region = null;

    // 1) التعيين المكاني
    if (store.lat != null && store.lng != null) {
      for (const r of withPolygon) {
        if (pointInPolygon(store.lat, store.lng, r.polygon)) {
          region = regionMap.get(normalizeName(r.name));
          stats.byPolygon++;
          break;
        }
      }
    }

    // 2) مطابقة الاسم نصياً
    if (!region && store.district) {
      region = regionMap.get(normalizeName(store.district));
      if (region) stats.byName++;
    }

    // 3) منطقة نصية جديدة (مدن خارج مضلعات حلب)
    if (!region && store.district) {
      const key = normalizeName(store.district);
      if (!regionMap.has(key)) {
        regionMap.set(key, {
          name: store.district, polygon: null, labelLat: null, labelLng: null,
          storeCount: 0, sumLat: 0, sumLng: 0,
        });
      }
      region = regionMap.get(key);
      stats.byName++;
    }

    if (!region) stats.noRegion++;
    store.regionName = region ? region.name : null;
    if (region && store.lat != null && store.lng != null) {
      region.storeCount++;
      region.sumLat += store.lat;
      region.sumLng += store.lng;
    }
  }

  // نقطة تسمية افتراضية للمناطق النصية: مركز محلاتها
  for (const r of regionMap.values()) {
    if (r.labelLat == null && r.storeCount > 0) {
      r.labelLat = Math.round((r.sumLat / r.storeCount) * 1e7) / 1e7;
      r.labelLng = Math.round((r.sumLng / r.storeCount) * 1e7) / 1e7;
    }
  }

  const regions = [...regionMap.values()]
    .filter((r) => r.polygon || r.storeCount > 0)
    .map(({ name, polygon, labelLat, labelLng, storeCount }) => ({ name, polygon, labelLat, labelLng, storeCount }));

  return { regions, stats };
}
