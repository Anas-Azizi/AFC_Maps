import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true });

const asArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const folderName = (f) => String(f?.name ?? '').trim();

// تطبيع الأسماء العربية للمطابقة (الموكامبو/الموغامبو لا يعالجهما — يحسمان في المعاينة)
export function normalizeName(s) {
  return String(s ?? '')
    .trim()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ');
}

function parsePoint(pm) {
  const raw = pm?.Point?.coordinates;
  if (raw == null) return null;
  const [lng, lat] = String(raw).trim().split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function parsePolygon(pm) {
  const raw = pm?.Polygon?.outerBoundaryIs?.LinearRing?.coordinates;
  if (raw == null) return null;
  const points = String(raw)
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [lng, lat] = pair.split(',').map(Number);
      return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
    })
    .filter(Boolean);
  return points.length >= 3 ? points : null;
}

function findFolderDeep(node, name) {
  for (const f of asArray(node?.Folder)) {
    if (folderName(f) === name) return f;
    const found = findFolderDeep(f, name);
    if (found) return found;
  }
  return null;
}

function collectPolygons(node, out = []) {
  for (const pm of asArray(node?.Placemark)) {
    const polygon = parsePolygon(pm);
    if (polygon) out.push({ name: folderName(pm), polygon });
  }
  for (const f of asArray(node?.Folder)) collectPolygons(f, out);
  return out;
}

/**
 * يحلل ملف KMZ ببنية ملف الشركة:
 *   My Places > AFC > Customers  → مناطق (مجلدات) ومحلات (نقاط)
 *   My Places > AFC > Districts  → مضلعات حدود المناطق + نقاط تسمية
 * يتجاهل: Transportation و Master.
 */
export function parseKmz(buffer) {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith('.kml'));
  if (!entry) throw new Error('ملف KMZ لا يحتوي ملف KML');
  const doc = parser.parse(entry.getData().toString('utf8'));

  const document = doc?.kml?.Document;
  if (!document) throw new Error('بنية KML غير صالحة');

  const customers = findFolderDeep(document, 'Customers');
  const districts = findFolderDeep(document, 'Districts');
  if (!customers) throw new Error('لم يُعثر على مجلد Customers في الملف');

  // المناطق والمحلات من مجلدات Customers
  const regionMap = new Map();
  for (const folder of asArray(customers.Folder)) {
    const name = folderName(folder);
    if (!name) continue;
    const stores = asArray(folder.Placemark)
      .map((pm) => {
        const point = parsePoint(pm);
        return point ? { name: folderName(pm), ...point } : null;
      })
      .filter((s) => s && s.name);
    regionMap.set(normalizeName(name), { name, stores, polygon: null, labelLat: null, labelLng: null });
  }

  // حدود المناطق ونقاط التسمية من Districts
  const unmatchedPolygons = [];
  if (districts) {
    for (const { name, polygon } of collectPolygons(districts)) {
      const key = normalizeName(name);
      const region = regionMap.get(key);
      if (region) {
        region.polygon = polygon;
      } else {
        unmatchedPolygons.push(name);
        regionMap.set(key, { name, stores: [], polygon, labelLat: null, labelLng: null });
      }
    }
    const labelFolder = asArray(districts.Folder).find((f) => folderName(f) === 'District Names');
    if (labelFolder) {
      for (const pm of asArray(labelFolder.Placemark)) {
        const point = parsePoint(pm);
        const region = point && regionMap.get(normalizeName(folderName(pm)));
        if (region) {
          region.labelLat = point.lat;
          region.labelLng = point.lng;
        }
      }
    }
  }

  const regions = [...regionMap.values()];
  return {
    regions,
    stats: {
      regions: regions.length,
      stores: regions.reduce((n, r) => n + r.stores.length, 0),
      polygons: regions.filter((r) => r.polygon).length,
      unmatchedPolygons,
    },
  };
}
