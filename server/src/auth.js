import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { db, getMeta, setMeta } from './db.js';

function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  let secret = getMeta('jwt_secret');
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    setMeta('jwt_secret', secret);
  }
  return secret;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return test.length === expected.length && crypto.timingSafeEqual(test, expected);
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, getJwtSecret(), { expiresIn: '180d' });
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'مطلوب تسجيل الدخول' });
  try {
    const payload = jwt.verify(token, getJwtSecret());
    const user = db.prepare('SELECT id, name, username, role, active FROM users WHERE id = ?').get(payload.sub);
    if (!user || !user.active) return res.status(401).json({ error: 'الحساب غير فعّال' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'جلسة غير صالحة' });
  }
}

export function adminRequired(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'صلاحيات الإدارة مطلوبة' });
  next();
}
