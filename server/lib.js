import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import { db, UPLOADS_DIR } from './db.js';

// ---------- errors: one shape everywhere ----------
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const bad = (message, details) => new HttpError(400, 'INVALID_INPUT', message, details);
export const forbidden = (message = 'Not allowed') => new HttpError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Not found') => new HttpError(404, 'NOT_FOUND', what);
export const conflict = (code, message) => new HttpError(409, code, message);

// ---------- sessions: signed httpOnly cookie "sid" = "<userId>.<issuedAt>.<hmac>" ----------
const SECRET = process.env.SESSION_SECRET || 'dev-only-secret-change-me';
if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('WARNING: SESSION_SECRET is not set');
}
const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');

export function setSession(res, userId) {
  const value = `${userId}.${Date.now()}`;
  res.cookie('sid', `${value}.${sign(value)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 3600 * 1000,
    path: '/',
  });
}
export function clearSession(res) {
  res.clearCookie('sid', { path: '/' });
}

const userById = db.prepare('SELECT * FROM users WHERE id = ?');

export function loadUser(req, _res, next) {
  const raw = req.cookies?.sid;
  req.user = null;
  if (raw) {
    const i = raw.lastIndexOf('.');
    const value = raw.slice(0, i);
    const sig = raw.slice(i + 1);
    const expected = sign(value);
    if (sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      req.user = userById.get(Number(value.split('.')[0])) || null;
    }
  }
  next();
}
export function requireUser(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'UNAUTHORIZED', 'Please log in'));
  next();
}
export function requireSeller(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'UNAUTHORIZED', 'Please log in'));
  if (!req.user.store_name) return next(forbidden('Become a seller first'));
  next();
}

const lastAddress = db.prepare(
  'SELECT recipient, phone, region, city, street, apartment, note FROM orders WHERE buyer_id = ? ORDER BY id DESC LIMIT 1'
);
export function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    store_name: u.store_name,
    is_seller: !!u.store_name,
    last_address: lastAddress.get(u.id) || null,
  };
}

// ---------- validation helpers ----------
export const str = (v) => (typeof v === 'string' ? v.trim() : '');
export function int(v) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return Number.isInteger(n) ? n : NaN;
}
export const PHONE_RE = /^[+0-9][0-9 ()-]{5,19}$/;

export const REGIONS = [
  'Yerevan', 'Aragatsotn', 'Ararat', 'Armavir', 'Gegharkunik', 'Kotayk',
  'Lori', 'Shirak', 'Syunik', 'Tavush', 'Vayots Dzor',
];
export const STATUSES = ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled'];

// The one list of allowed moves. Everything else is 409.
export const TRANSITIONS = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

// ---------- images ----------
export const imageUrls = (base) =>
  base ? { thumb: `/uploads/${base}_thumb.webp`, large: `/uploads/${base}_large.webp` } : null;

// Resize one upload buffer into thumb + large webp files. Done OUTSIDE any DB transaction.
export async function saveImage(buffer) {
  const base = `${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
  const img = sharp(buffer, { failOn: 'error' }).rotate(); // rotate() applies EXIF orientation
  await img.clone().resize(400, 400, { fit: 'cover' }).webp({ quality: 78 })
    .toFile(path.join(UPLOADS_DIR, `${base}_thumb.webp`));
  await img.clone().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 })
    .toFile(path.join(UPLOADS_DIR, `${base}_large.webp`));
  return base;
}
export function deleteImageFiles(base) {
  for (const s of ['thumb', 'large']) fs.rm(path.join(UPLOADS_DIR, `${base}_${s}.webp`), { force: true }, () => {});
}
