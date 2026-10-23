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
      const v = c?.v;
      if (v == null) continue;
      cells[col] = c?.['@_t'] === 's' ? (strings[Number(v)] ?? '') : String(v);
    }
    return cells;
  });
}

for (const [label, path] of [['CUSTOMERS', process.argv[2]], ['ROUTES', process.argv[3]]]) {
  console.log('===== ' + label + ' =====');
  const rows = readRows(readFileSync(path));
  console.log('total rows:', rows.length);
  const header = rows[0];
  console.log('--- header ---');
  Object.keys(header).sort().forEach((k) => console.log(`  ${k}: ${JSON.stringify(header[k]).slice(0, 80)}`));
  for (let i = 1; i < Math.min(4, rows.length); i++) {
    console.log(`--- row ${i} ---`);
    Object.keys(rows[i]).sort().forEach((k) => console.log(`  ${k}: ${JSON.stringify(rows[i][k]).slice(0, 80)}`));
  }
  // distinct value samples for key columns
  if (label === 'CUSTOMERS') {
    for (const col of ['C','D','E','N','O']) {
      const vals = new Map();
      for (const r of rows.slice(1)) { const v = r[col]; if (v != null) vals.set(v, (vals.get(v) || 0) + 1); }
      console.log(`col ${col} distinct (${vals.size}):`, [...vals.entries()].slice(0, 15).map(([v, n]) => `${JSON.stringify(v)}×${n}`).join(' '));
    }
  }
  if (label === 'ROUTES') {
    for (const col of Object.keys(rows[1] || {}).sort()) {
      const vals = new Map();
      for (const r of rows.slice(1)) { const v = r[col]; if (v != null) vals.set(v, (vals.get(v) || 0) + 1); }
      console.log(`col ${col} distinct (${vals.size}):`, [...vals.entries()].slice(0, 12).map(([v, n]) => `${JSON.stringify(v).slice(0,40)}×${n}`).join(' '));
    }
  }
}
