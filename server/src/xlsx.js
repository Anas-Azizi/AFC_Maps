import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';

/**
 * يحلل ملف Excel (Qry_Upload_Guid.xlsx) بأعمدته الثابتة:
 * A: ID — كود الزبون | B: ShopName | C: District | D: Address
 * E: Latitude | F: Longitude (بصيغة DMS مثل 36°12'26.93"N)
 * G/H/I: السلة 1 (مندوب/تصنيف/يوم) — J/K/L: السلة 2 — M/N/O: السلة 3
 */

const COLS = {
  code: 'A', name: 'B', district: 'C', address: 'D', lat: 'E', lng: 'F',
  b1Rep: 'G', b1Channel: 'H', b1Day: 'I',
  b2Rep: 'J', b2Channel: 'K', b2Day: 'L',
  b3Rep: 'M', b3Channel: 'N', b3Day: 'O',
};

function dmsToDec(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(/(\d+)\s*[°º]\s*(\d+)\s*['′]\s*([\d.]+)\s*["″]?\s*([NSEW])/i);
  if (!m) return null;
  let d = Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600;
  if (/[SW]/i.test(m[4])) d = -d;
  if (!Number.isFinite(d) || Math.abs(d) > 180) return null;
  return Math.round(d * 1e7) / 1e7;
}

function cleanText(value) {
  if (value == null) return null;
  const s = String(value).replace(/[\r\n]+/g, ' ').replace(/_x000D_/gi, ' ').replace(/\s+/g, ' ').trim();
  return s || null;
}

export function parseXlsx(buffer) {
  const zip = new AdmZip(buffer);
  const ssEntry = zip.getEntry('xl/sharedStrings.xml');
  const sheetEntry = zip.getEntries().find((e) => /^xl\/worksheets\/sheet1\.xml$/.test(e.entryName));
  if (!sheetEntry) throw new Error('ملف Excel غير صالح — لم يُعثر على ورقة العمل');

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const strings = [];
  if (ssEntry) {
    const ss = parser.parse(ssEntry.getData().toString('utf8'));
    for (const si of [].concat(ss?.sst?.si ?? [])) {
      // النص قد يكون مباشرة أو مقسماً في <r><t>
      if (typeof si?.t === 'string' || typeof si?.t === 'number') strings.push(String(si.t));
      else if (si?.r) strings.push([].concat(si.r).map((r) => String(r?.t ?? '')).join(''));
      else strings.push('');
    }
  }
  const sheet = parser.parse(sheetEntry.getData().toString('utf8'));
  const rows = [].concat(sheet?.worksheet?.sheetData?.row ?? []);
  if (rows.length < 2) throw new Error('ملف Excel فارغ أو بلا صفوف بيانات');

  const readRow = (row) => {
    const cells = {};
    for (const c of [].concat(row?.c ?? [])) {
      const ref = String(c?.['@_r'] ?? '');
      const col = ref.replace(/\d+$/, '');
      const v = c?.v;
      if (v == null) continue;
      cells[col] = c?.['@_t'] === 's' ? (strings[Number(v)] ?? '') : String(v);
    }
    return cells;
  };

  const header = readRow(rows[0]);
  if (!header[COLS.code] || !header[COLS.name]) {
    throw new Error('بنية الأعمدة غير متوقعة — العمود الأول يجب أن يكون ID والثاني ShopName');
  }

  const stores = [];
  const stats = { total: 0, noCoords: 0, noDistrict: 0, duplicateCodes: 0 };
  const seenCodes = new Set();

  for (const row of rows.slice(1)) {
    const cells = readRow(row);
    const name = cleanText(cells[COLS.name]);
    const codeRaw = cleanText(cells[COLS.code]);
    if (!name && !codeRaw) continue; // صف فارغ
    if (!name) continue; // لا فائدة من صف بلا اسم

    let code = null;
    if (codeRaw && /^\d+$/.test(codeRaw)) {
      code = Number(codeRaw);
      if (seenCodes.has(code)) stats.duplicateCodes++;
      seenCodes.add(code);
    }

    const lat = dmsToDec(cells[COLS.lat]);
    const lng = dmsToDec(cells[COLS.lng]);
    if (lat == null || lng == null) stats.noCoords++;

    const district = cleanText(cells[COLS.district]);
    if (!district) stats.noDistrict++;

    stores.push({
      code,
      name,
      district,
      address: cleanText(cells[COLS.address]),
      lat,
      lng,
      b1Rep: cleanText(cells[COLS.b1Rep]),
      b1Channel: cleanText(cells[COLS.b1Channel]),
      b1Day: cleanText(cells[COLS.b1Day]),
      b2Rep: cleanText(cells[COLS.b2Rep]),
      b2Channel: cleanText(cells[COLS.b2Channel]),
      b2Day: cleanText(cells[COLS.b2Day]),
      b3Rep: cleanText(cells[COLS.b3Rep]),
      b3Channel: cleanText(cells[COLS.b3Channel]),
      b3Day: cleanText(cells[COLS.b3Day]),
    });
    stats.total++;
  }

  return { stores, stats };
}
