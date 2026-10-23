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
  const rows = [].concat(sheet?.worksheet?.sheetData?.row ?? []);
  return rows.map((row) => {
    const cells = {};
    for (const c of [].concat(row?.c ?? [])) {
      const ref = String(c?.['@_r'] ?? '');
      const col = ref.replace(/\d+$/, '');
      const t = c?.['@_t'];
      let v = c?.v;
      if (t === 's') v = strings[Number(v)] ?? '';
      else if (t === 'inlineStr') {
        const is = c?.is;
        if (typeof is?.t === 'string' || typeof is?.t === 'number') v = String(is.t);
        else if (is?.r) v = [].concat(is.r).map((r) => String(r?.t ?? '')).join('');
        else v = '';
      }
      if (v == null) continue;
      cells[col] = String(v);
    }
    return cells;
  });
}

const cust = readRows(readFileSync(process.argv[2])).slice(1);
const routes = readRows(readFileSync(process.argv[3])).slice(1);

console.log('customers:', cust.length, ' routes:', routes.length);

const dist = (rows, col, label, limit = 20) => {
  const m = new Map();
  for (const r of rows) { const v = (r[col] ?? '').trim(); m.set(v, (m.get(v) || 0) + 1); }
  console.log(`${label} (${m.size}):`, [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0, limit).map(([v,n])=>`${JSON.stringify(v)}×${n}`).join(' '));
};

dist(cust, 'C', 'AccountType');
dist(cust, 'D', 'Status');
dist(cust, 'E', 'MapShow');
dist(cust, 'I', 'Governate', 8);
dist(cust, 'H', 'RepName', 15);
console.log('with coords:', cust.filter(r=>r.N&&r.O).length, ' without:', cust.filter(r=>!r.N||!r.O).length);
console.log('with district:', cust.filter(r=>r.J).length);
const codes = new Set(cust.map(r=>r.A));
const dupCheck = new Set(); let dups = 0;
for (const r of cust) { if (dupCheck.has(r.A)) dups++; dupCheck.add(r.A); }
console.log('duplicate customer codes:', dups);

// routes analysis
dist(routes, 'C', 'Visit_Day');
const repNames = new Map();
for (const r of routes) repNames.set(r.B, (repNames.get(r.B)||0)+1);
console.log('route reps (' + repNames.size + '):', [...repNames.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([v,n])=>`${JSON.stringify(v)}×${n}`).join(' '));

// per-customer row count in routes
const perCust = new Map();
for (const r of routes) { if (!perCust.has(r.A)) perCust.set(r.A, []); perCust.get(r.A).push(`${r.B}|${r.C}`); }
const countDist = new Map();
for (const [, v] of perCust) countDist.set(v.length, (countDist.get(v.length)||0)+1);
console.log('routes-per-customer distribution:', [...countDist.entries()].sort().map(([k,n])=>`${k} rows×${n} customers`).join(', '));
// example customer with 3 rows
for (const [id, v] of perCust) { if (v.length === 3) { console.log('sample 3-row customer', id, ':', v.join('  ||  ')); break; } }
for (const [id, v] of perCust) { if (v.length === 1) { console.log('sample 1-row customer', id, ':', v.join('')); break; } }
// routes referencing unknown customers
let orphan = 0; for (const id of perCust.keys()) if (!codes.has(id)) orphan++;
console.log('route customers not in customers file:', orphan);
// customers without routes
let noRoute = 0; for (const id of codes) if (!perCust.has(id)) noRoute++;
console.log('customers without any route:', noRoute);
