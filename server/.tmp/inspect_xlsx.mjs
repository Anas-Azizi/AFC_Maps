import { readFileSync } from 'node:fs';
import { parseXlsxRows } from '../src/xlsx.js';

for (const [label, path] of [
  ['CUSTOMERS', process.argv[2]],
  ['ROUTES', process.argv[3]],
]) {
  console.log('===== ' + label + ' =====');
  const rows = parseXlsxRows(readFileSync(path));
  console.log('rows:', rows.length);
  for (let i = 0; i < Math.min(4, rows.length); i++) {
    const r = rows[i];
    console.log(`--- row ${i} (${r.length} cells) ---`);
    r.forEach((c, j) => { if (c !== '' && c != null) console.log(`  [${j}] ${JSON.stringify(String(c)).slice(0, 90)}`); });
  }
}
