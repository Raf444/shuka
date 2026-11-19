// Accounts + catalog (anyone can browse) + reviews.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, now, immediate } from '../db.js';
import {
  bad, conflict, forbidden, notFound, HttpError, setSession, clearSession, requireUser,
  publicUser, str, int, PHONE_RE, REGIONS, imageUrls,
} from '../lib.js';

const r = Router();

// ---------------- auth ----------------
r.post('/auth/register', (req, res) => {
  const email = str(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const name = str(req.body.name);
  const phone = str(req.body.phone);
  const details = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) details.email = 'Enter a valid email';
  if (password.length < 6) details.password = 'At least 6 characters';
  if (!name) details.name = 'Required';
  if (!PHONE_RE.test(phone)) details.phone = 'Enter a valid phone, e.g. +374 91 123456';
  if (Object.keys(details).length) throw bad('Please fix the highlighted fields', details);

  const hash = bcrypt.hashSync(password, 10);
  try {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (email, password_hash, name, phone, created_at) VALUES (?,?,?,?,?)')
      .run(email, hash, name, phone, now());
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid);
    setSession(res, user.id);
    res.status(201).json({ user: publicUser(user) });
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) {
      throw new HttpError(409, 'EMAIL_TAKEN', 'This email is already registered', { email: 'Already registered' });
    }
    throw e;
  }
});

r.post('/auth/login', (req, res) => {
  const email = str(req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    throw new HttpError(401, 'BAD_CREDENTIALS', 'Wrong email or password');
  }
  setSession(res, user.id);
  res.json({ user: publicUser(user) });
});

r.post('/auth/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

r.get('/me', requireUser, (req, res) => res.json({ user: publicUser(req.user) }));

r.patch('/me', requireUser, (req, res) => {
  const name = req.body.name !== undefined ? str(req.body.name) : req.user.name;
  const phone = req.body.phone !== undefined ? str(req.body.phone) : req.user.phone;
  const details = {};
  if (!name) details.name = 'Required';
  if (!PHONE_RE.test(phone)) details.phone = 'Enter a valid phone';
  if (Object.keys(details).length) throw bad('Please fix the highlighted fields', details);
  db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name, phone, req.user.id);
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

// ---------------- catalog ----------------
r.get('/regions', (_req, res) => res.json({ regions: REGIONS }));

r.get('/categories', (_req, res) => {
  const categories = db.prepare(`
    SELECT c.id, c.name, c.slug,
           (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_published = 1) AS product_count
    FROM categories c ORDER BY c.name`).all();
  res.json({ categories });
});

const MAIN_IMAGE = '(SELECT file_path FROM product_images i WHERE i.product_id = p.id ORDER BY position LIMIT 1)';
export const cardRow = (p) => ({
  id: p.id,
  title: p.title,
  price_amd: p.price_amd,
  stock: p.stock,
  rating_avg: Math.round(p.rating_avg * 10) / 10,
  rating_count: p.rating_count,
  image: imageUrls(p.main_image),
  seller: { id: p.seller_id, store_name: p.store_name },
  category: { slug: p.category_slug, name: p.category_name },
});

const SORTS = {
  newest: 'p.created_at DESC, p.id DESC',
  price_asc: 'p.price_amd ASC, p.id DESC',
  price_desc: 'p.price_amd DESC, p.id DESC',
  rating: 'p.rating_avg DESC, p.rating_count DESC, p.id DESC',
};

r.get('/products', (req, res) => {
  const where = ['p.is_published = 1'];
  const args = [];
  const q = str(req.query.q);
  if (q) {
    for (const word of q.split(/\s+/).slice(0, 5)) {
      where.push("(p.title LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')");
      const like = `%${word.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
      args.push(like, like);
    }
  }
  if (str(req.query.category)) { where.push('c.slug = ?'); args.push(str(req.query.category)); }
  const minPrice = int(req.query.minPrice);
  const maxPrice = int(req.query.maxPrice);
  if (minPrice >= 0) { where.push('p.price_amd >= ?'); args.push(minPrice); }
  if (maxPrice >= 0) { where.push('p.price_amd <= ?'); args.push(maxPrice); }
  const sort = SORTS[req.query.sort] || SORTS.newest;
  const limit = Math.min(Math.max(int(req.query.limit) || 24, 1), 60);
  const page = Math.max(int(req.query.page) || 1, 1);

  const from = `FROM products p JOIN categories c ON c.id = p.category_id JOIN users u ON u.id = p.seller_id
                WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) ${from}`).pluck().get(...args);
  const rows = db.prepare(`
    SELECT p.*, u.store_name, c.slug AS category_slug, c.name AS category_name, ${MAIN_IMAGE} AS main_image
    ${from} ORDER BY ${sort} LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit);
  res.json({ items: rows.map(cardRow), total, page, pages: Math.max(1, Math.ceil(total / limit)), limit });
});

export function productDetail(id) {
  const p = db.prepare(`
    SELECT p.*, u.store_name, c.name AS category_name, c.slug AS category_slug
    FROM products p JOIN users u ON u.id = p.seller_id JOIN categories c ON c.id = p.category_id
    WHERE p.id = ?`).get(id);
  if (!p) return null;
  const images = db.prepare('SELECT id, position, file_path FROM product_images WHERE product_id = ? ORDER BY position')
    .all(id).map((i) => ({ id: i.id, position: i.position, ...imageUrls(i.file_path) }));
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    price_amd: p.price_amd,
    stock: p.stock,
    rating_avg: Math.round(p.rating_avg * 10) / 10,
    rating_count: p.rating_count,
    is_published: !!p.is_published,
    created_at: p.created_at,
    category: { id: p.category_id, name: p.category_name, slug: p.category_slug },
    seller: { id: p.seller_id, store_name: p.store_name },
    images,
  };
}

r.get('/products/:id', (req, res) => {
  const product = productDetail(int(req.params.id));
  // unpublished products are visible only to their seller
  if (!product || (!product.is_published && product.seller.id !== req.user?.id)) throw notFound('Product not found');
  res.json({ product });
});

r.get('/products/:id/reviews', (req, res) => {
  const reviews = db.prepare(`
    SELECT r.id, r.rating, r.body, r.created_at, u.name AS buyer_name
    FROM reviews r JOIN users u ON u.id = r.buyer_id
    WHERE r.product_id = ? ORDER BY r.created_at DESC, r.id DESC`).all(int(req.params.id));
  res.json({ reviews });
});

r.post('/products/:id/reviews', requireUser, (req, res) => {
  const productId = int(req.params.id);
  const rating = int(req.body.rating);
  const body = str(req.body.body).slice(0, 2000);
  if (!(rating >= 1 && rating <= 5)) throw bad('Rating must be 1–5', { rating: 'Choose 1–5 stars' });

  const review = immediate(() => {
    const delivered = db.prepare(`
      SELECT 1 FROM order_items oi
      JOIN seller_orders so ON so.id = oi.seller_order_id
      JOIN orders o ON o.id = so.order_id
      WHERE oi.product_id = ? AND o.buyer_id = ? AND so.status = 'delivered' LIMIT 1`).get(productId, req.user.id);
    if (!delivered) throw forbidden('You can review only items delivered to you');
    if (db.prepare('SELECT 1 FROM reviews WHERE product_id = ? AND buyer_id = ?').get(productId, req.user.id)) {
      throw conflict('ALREADY_REVIEWED', 'You already reviewed this product');
    }
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO reviews (product_id, buyer_id, rating, body, created_at) VALUES (?,?,?,?,?)'
    ).run(productId, req.user.id, rating, body, now());
    db.prepare(`
      UPDATE products SET
        rating_avg   = (SELECT AVG(rating) FROM reviews WHERE product_id = ?),
        rating_count = (SELECT COUNT(*)   FROM reviews WHERE product_id = ?)
      WHERE id = ?`).run(productId, productId, productId);
    return db.prepare('SELECT id, rating, body, created_at FROM reviews WHERE id = ?').get(lastInsertRowid);
  });
  res.status(201).json({ review: { ...review, buyer_name: req.user.name } });
});

export default r;
