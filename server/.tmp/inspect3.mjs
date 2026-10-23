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

for (const [label, path] of [['CUSTOMERS', process.argv[2]], ['ROUTES', process.argv[3]]]) {
  console.log('===== ' + label + ' =====');
  const rows = readRows(readFileSync(path));
  console.log('total rows:', rows.length);
  for (let i = 0; i < Math.min(4, rows.length); i++) {
    console.log(`--- row ${i} ---`);
    Object.keys(rows[i]).sort().forEach((k) => console.log(`  ${k}: ${JSON.stringify(rows[i][k]).slice(0, 90)}`));
  }
}
