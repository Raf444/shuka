// Seller dashboard. Every query is scoped with "AND seller_id = ?" to the current user.
import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { db, now } from '../db.js';
import {
  bad, conflict, notFound, HttpError, requireUser, requireSeller, publicUser, str, int, PHONE_RE,
  TRANSITIONS, STATUSES, imageUrls, saveImage, deleteImageFiles,
} from '../lib.js';
import { productDetail } from './public.js';
import { changeStatus, historyFor, itemsFor } from './buyer.js';

const r = Router();
const MAX_IMAGES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

r.post('/seller/activate', requireUser, (req, res) => {
  const storeName = str(req.body.store_name);
  const phone = str(req.body.phone);
  const details = {};
  if (storeName.length < 2 || storeName.length > 60) details.store_name = '2–60 characters';
  if (!PHONE_RE.test(phone)) details.phone = 'Enter a valid phone';
  if (Object.keys(details).length) throw bad('Please fix the highlighted fields', details);
  try {
    db.prepare('UPDATE users SET store_name = ?, phone = ? WHERE id = ?').run(storeName, phone, req.user.id);
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) {
      throw new HttpError(409, 'STORE_NAME_TAKEN', 'This store name is taken', { store_name: 'Already taken' });
    }
    throw e;
  }
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

r.use('/seller', requireSeller);

// ---------------- overview (plain SQL) ----------------
r.get('/seller/overview', (req, res) => {
  const id = req.user.id;
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const row of db.prepare('SELECT status, COUNT(*) AS n FROM seller_orders WHERE seller_id = ? GROUP BY status').all(id)) {
    counts[row.status] = row.n;
  }
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const revenue30 = db.prepare(`SELECT COALESCE(SUM(subtotal_amd), 0) FROM seller_orders
                                WHERE seller_id = ? AND status = 'delivered' AND updated_at >= ?`).pluck().get(id, since);
  const revenueTotal = db.prepare(`SELECT COALESCE(SUM(subtotal_amd), 0) FROM seller_orders
                                   WHERE seller_id = ? AND status = 'delivered'`).pluck().get(id);
  const productsCount = db.prepare('SELECT COUNT(*) FROM products WHERE seller_id = ?').pluck().get(id);
  res.json({
    to_confirm: counts.placed, to_ship: counts.confirmed,
    revenue_30d: revenue30, revenue_total: revenueTotal, counts, products_count: productsCount,
  });
});

// ---------------- products ----------------
r.get('/seller/products', (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.title, p.price_amd, p.stock, p.is_published, c.name AS category_name,
      (SELECT file_path FROM product_images i WHERE i.product_id = p.id ORDER BY position LIMIT 1) AS main_image,
      (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi JOIN seller_orders so ON so.id = oi.seller_order_id
        WHERE oi.product_id = p.id AND so.status != 'cancelled') AS units_sold
    FROM products p JOIN categories c ON c.id = p.category_id
    WHERE p.seller_id = ? ORDER BY p.created_at DESC, p.id DESC`).all(req.user.id);
  res.json({
    products: rows.map(({ main_image, category_name, ...p }) => ({
      ...p, is_published: !!p.is_published, image: imageUrls(main_image), category: { name: category_name },
    })),
  });
});

function ownProduct(req) {
  const p = db.prepare('SELECT * FROM products WHERE id = ? AND seller_id = ?').get(int(req.params.id), req.user.id);
  if (!p) throw notFound('Product not found');
  return p;
}

r.get('/seller/products/:id', (req, res) => {
  const p = ownProduct(req);
  res.json({ product: productDetail(p.id) });
});

function validateProduct(body, partial) {
  const out = {};
  const details = {};
  const has = (k) => body[k] !== undefined;
  if (!partial || has('title')) {
    out.title = str(body.title);
    if (out.title.length < 3 || out.title.length > 120) details.title = '3–120 characters';
  }
  if (!partial || has('description')) {
    out.description = str(body.description);
    if (out.description.length < 10 || out.description.length > 5000) details.description = '10–5000 characters';
  }
  if (!partial || has('category_id')) {
    out.category_id = int(body.category_id);
    if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(out.category_id)) details.category_id = 'Choose a category';
  }
  if (!partial || has('price_amd')) {
    out.price_amd = int(body.price_amd);
    if (!(out.price_amd > 0 && out.price_amd <= 100_000_000)) details.price_amd = 'A whole number of dram, more than 0';
  }
  if (!partial || has('stock')) {
    out.stock = int(body.stock);
    if (!(out.stock >= 0 && out.stock <= 100_000)) details.stock = 'A whole number, 0 or more';
  }
  if (has('is_published')) out.is_published = body.is_published ? 1 : 0;
  if (Object.keys(details).length) throw bad('Please fix the highlighted fields', details);
  return out;
}

r.post('/seller/products', (req, res) => {
  const v = validateProduct(req.body, false);
  const ts = now();
  // A new product has no images yet, so it starts unpublished; the editor publishes it after uploading.
  const id = db.prepare(`
    INSERT INTO products (seller_id, category_id, title, description, price_amd, stock, is_published, created_at, updated_at)
    VALUES (?,?,?,?,?,?,0,?,?)`).run(req.user.id, v.category_id, v.title, v.description, v.price_amd, v.stock, ts, ts)
    .lastInsertRowid;
  res.status(201).json({ product: productDetail(id) });
});

r.patch('/seller/products/:id', (req, res) => {
  const p = ownProduct(req);
  const v = validateProduct(req.body, true);
  if (v.is_published === 1) {
    const n = db.prepare('SELECT COUNT(*) FROM product_images WHERE product_id = ?').pluck().get(p.id);
    if (n === 0) throw new HttpError(400, 'NO_IMAGES', 'Add at least one image before publishing');
  }
  const keys = Object.keys(v);
  if (keys.length) {
    db.prepare(`UPDATE products SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND seller_id = ?`)
      .run(...keys.map((k) => v[k]), now(), p.id, req.user.id);
  }
  res.json({ product: productDetail(p.id) });
});

// ---------------- images ----------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: MAX_IMAGES },
}).array('images', MAX_IMAGES);

function runUpload(req, res) {
  return new Promise((resolve, reject) => {
    upload(req, res, (err) => {
      if (!err) return resolve();
      if (err.code === 'LIMIT_FILE_SIZE') return reject(new HttpError(400, 'TOO_LARGE', 'Each image must be 10 MB or smaller'));
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        return reject(new HttpError(400, 'TOO_MANY', `Up to ${MAX_IMAGES} images per product`));
      }
      reject(new HttpError(400, 'BAD_FILE', err.message));
    });
  });
}

const listImages = (productId) =>
  db.prepare('SELECT id, position, file_path FROM product_images WHERE product_id = ? ORDER BY position').all(productId)
    .map((i) => ({ id: i.id, position: i.position, ...imageUrls(i.file_path) }));

// Rewrite positions 0..n-1 in the given order (two passes so UNIQUE(product_id, position) never collides).
function reorder(productId, ids) {
  db.transaction(() => {
    const set = db.prepare('UPDATE product_images SET position = ? WHERE id = ? AND product_id = ?');
    ids.forEach((id, i) => set.run(-1 - i, id, productId));
    ids.forEach((id, i) => set.run(i, id, productId));
  })();
}

r.post('/seller/products/:id/images', async (req, res, next) => {
  try {
    const p = ownProduct(req);
    await runUpload(req, res);
    const files = req.files || [];
    if (files.length === 0) throw bad('Choose at least one image');
    const existing = db.prepare('SELECT COUNT(*) FROM product_images WHERE product_id = ?').pluck().get(p.id);
    if (existing + files.length > MAX_IMAGES) {
      throw new HttpError(400, 'TOO_MANY', `A product can have up to ${MAX_IMAGES} images (it has ${existing})`);
    }
    // Check the real content, not the file name: a renamed .exe fails here.
    for (const f of files) {
      let meta;
      try { meta = await sharp(f.buffer).metadata(); } catch { meta = null; }
      if (!meta || !['jpeg', 'png', 'webp'].includes(meta.format)) {
        throw new HttpError(400, 'BAD_FILE', `"${f.originalname}" is not a JPEG, PNG or WebP image`);
      }
    }
    // Resize and write files BEFORE touching the database (no slow work inside transactions).
    const bases = [];
    for (const f of files) bases.push(await saveImage(f.buffer));
    db.transaction(() => {
      let pos = db.prepare('SELECT COALESCE(MAX(position), -1) FROM product_images WHERE product_id = ?').pluck().get(p.id);
      const ins = db.prepare('INSERT INTO product_images (product_id, file_path, position) VALUES (?,?,?)');
      for (const b of bases) ins.run(p.id, b, ++pos);
    })();
    res.status(201).json({ images: listImages(p.id) });
  } catch (e) { next(e); }
});

r.delete('/seller/products/:id/images/:imageId', (req, res) => {
  const p = ownProduct(req);
  const img = db.prepare('SELECT * FROM product_images WHERE id = ? AND product_id = ?').get(int(req.params.imageId), p.id);
  if (!img) throw notFound('Image not found');
  db.prepare('DELETE FROM product_images WHERE id = ?').run(img.id);
  reorder(p.id, db.prepare('SELECT id FROM product_images WHERE product_id = ? ORDER BY position').pluck().all(p.id));
  if (p.is_published && listImages(p.id).length === 0) {
    db.prepare('UPDATE products SET is_published = 0, updated_at = ? WHERE id = ?').run(now(), p.id);
  }
  deleteImageFiles(img.file_path);
  res.json({ images: listImages(p.id) });
});

r.post('/seller/products/:id/images/:imageId/main', (req, res) => {
  const p = ownProduct(req);
  const imageId = int(req.params.imageId);
  const ids = db.prepare('SELECT id FROM product_images WHERE product_id = ? ORDER BY position').pluck().all(p.id);
  if (!ids.includes(imageId)) throw notFound('Image not found');
  reorder(p.id, [imageId, ...ids.filter((i) => i !== imageId)]);
  res.json({ images: listImages(p.id) });
});

// ---------------- orders ----------------
r.get('/seller/orders', (req, res) => {
  const status = str(req.query.status);
  const args = [req.user.id];
  let filter = '';
  if (status && status !== 'all') {
    if (!STATUSES.includes(status)) throw bad('Unknown status');
    filter = 'AND so.status = ?';
    args.push(status);
  }
  const orders = db.prepare(`
    SELECT so.id, so.order_id, so.status, so.subtotal_amd, so.updated_at, o.created_at, o.recipient, o.region, o.city,
           (SELECT SUM(quantity) FROM order_items WHERE seller_order_id = so.id) AS item_count
    FROM seller_orders so JOIN orders o ON o.id = so.order_id
    WHERE so.seller_id = ? ${filter} ORDER BY so.id DESC`).all(...args);
  const counts = Object.fromEntries(['all', ...STATUSES].map((s) => [s, 0]));
  for (const row of db.prepare('SELECT status, COUNT(*) AS n FROM seller_orders WHERE seller_id = ? GROUP BY status').all(req.user.id)) {
    counts[row.status] = row.n;
    counts.all += row.n;
  }
  res.json({ orders, counts });
});

function sellerOrder(soId, sellerId) {
  // Scoped: WHERE so.id = ? AND so.seller_id = ?
  const so = db.prepare(`
    SELECT so.id, so.order_id, so.status, so.subtotal_amd, o.created_at, u.name AS buyer_name,
           o.recipient, o.phone, o.region, o.city, o.street, o.apartment, o.note
    FROM seller_orders so JOIN orders o ON o.id = so.order_id JOIN users u ON u.id = o.buyer_id
    WHERE so.id = ? AND so.seller_id = ?`).get(soId, sellerId);
  if (!so) return null;
  return { ...so, items: itemsFor(so.id), history: historyFor(so.id), allowed: TRANSITIONS[so.status] };
}

r.get('/seller/orders/:id', (req, res) => {
  const order = sellerOrder(int(req.params.id), req.user.id);
  if (!order) throw notFound('Order not found');
  res.json({ order });
});

r.post('/seller/orders/:id/status', (req, res) => {
  const soId = int(req.params.id);
  if (!sellerOrder(soId, req.user.id)) throw notFound('Order not found');
  const to = str(req.body.to);
  if (!STATUSES.includes(to)) throw bad('Unknown status', { to: 'Unknown status' });
  changeStatus(soId, to, req.user.id);
  res.json({ order: sellerOrder(soId, req.user.id) });
});

export default r;
