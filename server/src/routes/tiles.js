import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { authRequired } from '../auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_FILE = path.join(__dirname, '..', '..', 'tiles', 'offline.sqlite');

export const tilesRouter = express.Router();

function packageInfo() {
  if (!fs.existsSync(PACKAGE_FILE)) return { available: false };
  let bbox = null;
  let zooms = null;
  try {
    const db = new DatabaseSync(PACKAGE_FILE, { readOnly: true });
    const meta = Object.fromEntries(
      db.prepare('SELECT key, value FROM meta').all().map((r) => [r.key, r.value])
    );
    db.close();
    bbox = meta.bbox ? JSON.parse(meta.bbox) : null;
    zooms = meta.zooms ? JSON.parse(meta.zooms) : null;
  } catch { /* ملف غير مكتمل */ }
  return { available: true, size: fs.statSync(PACKAGE_FILE).size, bbox, zooms };
}

tilesRouter.get('/info', authRequired, (req, res) => {
  res.json(packageInfo());
});

tilesRouter.get('/package', authRequired, (req, res) => {
  if (!fs.existsSync(PACKAGE_FILE)) {
    return res.status(404).json({ error: 'حزمة الخرائط غير متوفرة بعد' });
  }
  res.setHeader('Content-Type', 'application/octet-stream');
  res.download(PACKAGE_FILE, 'offline.sqlite');
});
