import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';

/**
 * محللات ملفي Excel:
 * - الزبائن (Qry_Upload_Guid_Customers): A:ID B:ShopName C:AccountType D:Status E:MapShow
 *   F:ShopCategory G:ShopClass H:RepName(المسؤول) I:Governate J:District K:Address
 *   L:MobileNumber M:WhatsNumber N/O: إحداثيات DMS مثل 36°12'26.93"N
 * - المسارات (Qry_Upload_Guide_Routes): A:ID B:Sales_Name C:Invoice_Type D:Visit_Day
 */

const CUST_COLS = {
  code: 'A', name: 'B', accountType: 'C', status: 'D', mapShow: 'E',
  category: 'F', shopClass: 'G', managerName: 'H', governate: 'I',
  district: 'J', address: 'K', phone: 'L', whatsapp: 'M', lat: 'N', lng: 'O',
};

const ROUTE_COLS = { code: 'A', rep: 'B', invoiceType: 'C', day: 'D' };

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

/** يقرأ ورقة العمل الأولى ويعيد صفوفاً على شكل {حرف العمود: قيمة} — يدعم sharedStrings و inlineStr */
function readSheetRows(buffer) {
  const zip = new AdmZip(buffer);
  const ssEntry = zip.getEntry('xl/sharedStrings.xml');
  const sheetEntry = zip.getEntries().find((e) => /^xl\/worksheets\/sheet1\.xml$/.test(e.entryName));
  if (!sheetEntry) throw new Error('ملف Excel غير صالح — لم يُعثر على ورقة العمل');

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const strings = [];
  if (ssEntry) {
    const ss = parser.parse(ssEntry.getData().toString('utf8'));
    for (const si of [].concat(ss?.sst?.si ?? [])) {
      if (typeof si?.t === 'string' || typeof si?.t === 'number') strings.push(String(si.t));
      else if (si?.r) strings.push([].concat(si.r).map((r) => String(r?.t ?? '')).join(''));
      else strings.push('');
    }
  }
  const sheet = parser.parse(sheetEntry.getData().toString('utf8'));
  const rows = [].concat(sheet?.worksheet?.sheetData?.row ?? []);
  return rows.map((row) => {
    const cells = {};
    for (const c of [].concat(row?.c ?? [])) {
      const col = String(c?.['@_r'] ?? '').replace(/\d+$/, '');
      if (!col) continue;
      const t = c?.['@_t'];
      let v = c?.v;
      if (t === 's') v = strings[Number(v)] ?? '';
      else if (t === 'inlineStr') {
        const is = c?.is;
        if (typeof is?.t === 'string' || typeof is?.t === 'number') v = String(is.t);
        else if (is?.r) v = [].concat(is.r).map((r) => String(r?.t ?? '')).join('');
        else v = '';
      }
      if (v != null) cells[col] = String(v);
    }
    return cells;
  });
}

function validateHeader(rows, label) {
  if (rows.length < 2) throw new Error(`${label}: الملف فارغ أو بلا صفوف بيانات`);
  const header = rows[0];
  if (!header.A || !/id/i.test(header.A)) {
    throw new Error(`${label}: بنية الأعمدة غير متوقعة — العمود الأول يجب أن يكون ID`);
  }
  return rows.slice(1);
}

export function parseCustomersXlsx(buffer) {
  const rows = validateHeader(readSheetRows(buffer), 'ملف الزبائن');
  const stores = [];
  const stats = { total: 0, noCoords: 0, noDistrict: 0, duplicateCodes: 0, cancelled: 0, mapShown: 0 };
  const seenCodes = new Set();

  for (const cells of rows) {
    const name = cleanText(cells[CUST_COLS.name]);
    const codeRaw = cleanText(cells[CUST_COLS.code]);
    if (!name && !codeRaw) continue;
    if (!name) continue;

    let code = null;
    if (codeRaw && /^\d+$/.test(codeRaw)) {
      code = Number(codeRaw);
      if (seenCodes.has(code)) stats.duplicateCodes++;
      seenCodes.add(code);
    }

    const lat = dmsToDec(cells[CUST_COLS.lat]);
    const lng = dmsToDec(cells[CUST_COLS.lng]);
    if (lat == null || lng == null) stats.noCoords++;

    const district = cleanText(cells[CUST_COLS.district]);
    if (!district) stats.noDistrict++;

    const status = cleanText(cells[CUST_COLS.status]);
    if (status && /cancel/i.test(status)) stats.cancelled++;

    const mapShow = cleanText(cells[CUST_COLS.mapShow]) === '1' ? 1 : 0;
    if (mapShow) stats.mapShown++;

    stores.push({
      code,
      name,
      district,
      address: cleanText(cells[CUST_COLS.address]),
      lat,
      lng,
      accountType: cleanText(cells[CUST_COLS.accountType]),
      status,
      mapShow,
      category: cleanText(cells[CUST_COLS.category]),
      shopClass: cleanText(cells[CUST_COLS.shopClass]),
      managerName: cleanText(cells[CUST_COLS.managerName]),
      governate: cleanText(cells[CUST_COLS.governate]),
      phone: cleanText(cells[CUST_COLS.phone]),
      whatsapp: cleanText(cells[CUST_COLS.whatsapp]),
    });
    stats.total++;
  }

  return { stores, stats };
}

export function parseRoutesXlsx(buffer) {
  const rows = validateHeader(readSheetRows(buffer), 'ملف المسارات');
  const visits = [];
  const stats = { total: 0, noCode: 0 };
  const seenCodes = new Set();

  for (const cells of rows) {
    const codeRaw = cleanText(cells[ROUTE_COLS.code]);
    if (!codeRaw) continue;
    if (!/^\d+$/.test(codeRaw)) { stats.noCode++; continue; }
    const code = Number(codeRaw);
    seenCodes.add(code);
    visits.push({
      code,
      repName: cleanText(cells[ROUTE_COLS.rep]),
      invoiceType: cleanText(cells[ROUTE_COLS.invoiceType]),
      visitDay: cleanText(cells[ROUTE_COLS.day]),
    });
    stats.total++;
  }
  stats.customers = seenCodes.size;
  return { visits, stats };
}
