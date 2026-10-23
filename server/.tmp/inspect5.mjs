import { readFileSync } from 'node:fs';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
function readRows(buffer) {
  const zip = new AdmZip(buffer);
  const ssEntry = zip.getEntry('xl/sharedStrings.xml');
  const sheetEntry = zip.getEntries().find((e) => /^xl\/worksheets\/sheet1\.xml$/.test(e.entryName));
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
  return [].concat(sheet?.worksheet?.sheetData?.row ?? []).map((row) => {
    const cells = {};
    for (const c of [].concat(row?.c ?? [])) {
      const col = String(c?.['@_r'] ?? '').replace(/\d+$/, '');
      const t = c?.['@_t'];
      let v = c?.v;
      if (t === 's') v = strings[Number(v)] ?? '';
      else if (t === 'inlineStr') {
        const is = c?.is;
        v = typeof is?.t === 'string' || typeof is?.t === 'number' ? String(is.t) : (is?.r ? [].concat(is.r).map((r) => String(r?.t ?? '')).join('') : '');
      }
      if (v != null) cells[col] = String(v);
    }
    return cells;
  });
}
const routes = readRows(readFileSync(process.argv[2])).slice(1);
console.log('rows:', routes.length);
const m = new Map();
for (const r of routes) { const v = (r.C ?? '').trim(); m.set(v, (m.get(v) || 0) + 1); }
console.log('Invoice_Type:', [...m.entries()].sort((a,b)=>b[1]-a[1]).map(([v,n])=>`${JSON.stringify(v)}×${n}`).join(' '));
const perCust = new Map();
for (const r of routes) { if (!perCust.has(r.A)) perCust.set(r.A, []); perCust.get(r.A).push(`${r.B}|${r.C}|${r.D}`); }
const cd = new Map();
for (const [, v] of perCust) cd.set(v.length, (cd.get(v.length)||0)+1);
console.log('rows-per-customer:', [...cd.entries()].sort((a,b)=>a[0]-b[0]).map(([k,n])=>`${k}×${n}`).join(', '));
for (const [id, v] of perCust) { if (v.length === 3) { console.log('sample 3-row:', id, '=>', v.join('  ||  ')); break; } }
let empty = 0; for (const r of routes) if (!r.B && !r.C && !r.D) empty++;
console.log('empty-ish rows:', empty);
