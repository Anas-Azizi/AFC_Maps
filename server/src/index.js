import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { verifyPassword, signToken, authRequired } from './auth.js';
import { dataRouter } from './routes/data.js';
import { adminRouter } from './routes/admin.js';
import { tilesRouter } from './routes/tiles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }
  res.json({ token: signToken(user), user: { id: user.id, name: user.name, role: user.role } });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ id: req.user.id, name: req.user.name, role: req.user.role });
});

app.use('/api/data', dataRouter);
app.use('/api/admin', adminRouter);
app.use('/api/tiles', tilesRouter);

// لوحة الإدارة (بعد بنائها)
const adminDist = path.join(__dirname, '..', '..', 'admin', 'dist');
app.use(express.static(adminDist));
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(adminDist, 'index.html'), (err) => {
    if (err) res.status(404).send('لوحة الإدارة غير مبنية بعد');
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'خطأ داخلي في الخادم' });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`الخادم يعمل على http://localhost:${port}`));
