import { normalizeName } from './kmz.js';

/**
 * يعيّن كل محل لمنطقة بالاسم فقط، من عمود «المنطقة» في ملف الزبائن.
 * يجمع القيم المطبَّعة المتطابقة تحت أول صيغة عرض ظهرت، ويعيد:
 * { regions: [{name, storeCount}], stats: { byName, noRegion } }
 */
export function assignRegionsByName(stores) {
  // خريطة الاسم المطبَّع → سجل المنطقة (الاسم المعروض = أول صيغة خام ظهرت)
  const regionMap = new Map();

  for (const store of stores) {
    const district = store.district;
    if (!district) {
      store.regionName = null;
      continue;
    }
    const key = normalizeName(district);
    if (!key) {
      store.regionName = null;
      continue;
    }
    if (!regionMap.has(key)) {
      regionMap.set(key, { name: district, storeCount: 0 });
    }
    const region = regionMap.get(key);
    region.storeCount++;
    store.regionName = region.name;
  }

  const stats = {
    byName: stores.filter((s) => s.regionName).length,
    noRegion: stores.filter((s) => !s.regionName).length,
  };
  return { regions: [...regionMap.values()], stats };
}
