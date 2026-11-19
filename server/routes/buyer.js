// Cart, checkout and the buyer's own orders. Every query is scoped to req.user.id.
import { Router } from 'express';
import { db, now, immediate } from '../db.js';
import {
  bad, conflict, forbidden, notFound, requireUser, str, int, PHONE_RE, REGIONS, TRANSITIONS, imageUrls,
} from '../lib.js';

const r = Router();
r.use(['/cart', '/orders'], requireUser);

const MAIN_IMAGE = '(SELECT file_path FROM product_images i WHERE i.product_id = p.id ORDER BY position LIMIT 1)';
const fmt = (n) => `${n.toLocaleString('en-US').replace(/,/g, ' ')} ֏`;

// ---------------- cart ----------------
export function buildCart(userId) {
  const rows = db.prepare(`
    SELECT ci.product_id, ci.quantity, ci.price_when_added,
           p.title, p.price_amd, p.stock, p.is_published, p.seller_id, u.store_name, ${MAIN_IMAGE} AS main_image
    FROM cart_items ci JOIN products p ON p.id = ci.product_id JOIN users u ON u.id = p.seller_id
    WHERE ci.user_id = ? ORDER BY u.store_name, p.title`).all(userId);
  const groups = new Map();
  let total = 0, count = 0, hasIssues = false;
  for (const row of rows) {
    const unavailable = !row.is_published || row.stock < row.quantity;
    const priceChanged = row.price_amd !== row.price_when_added;
    if (unavailable || priceChanged) hasIssues = true;
    if (!groups.has(row.seller_id)) {
      groups.set(row.seller_id, { seller: { id: row.seller_id, store_name: row.store_name }, subtotal_amd: 0, items: [] });
    }
    const g = groups.get(row.seller_id);
    g.items.push({
      product_id: row.product_id,
      title: row.title,
      image: imageUrls(row.main_image),
      price_amd: row.price_amd,
      price_when_added: row.price_when_added,
      quantity: row.quantity,
      stock: row.stock,
      is_published: !!row.is_published,
      price_changed: priceChanged,
      unavailable,
    });
    g.subtotal_amd += row.price_amd * row.quantity;
    total += row.price_amd * row.quantity;
    count += row.quantity;
  }
  return { groups: [...groups.values()], total_amd: total, count, has_issues: hasIssues };
}

r.get('/cart', (req, res) => res.json(buildCart(req.user.id)));

r.put('/cart/items/:productId', (req, res) => {
  const productId = int(req.params.productId);
  const qty = int(req.body.quantity);
  if (!(qty >= 1 && qty <= 999)) throw bad('Quantity must be at least 1', { quantity: 'Must be 1 or more' });
  const p = db.prepare('SELECT * FROM products WHERE id = ? AND is_published = 1').get(productId);
  if (!p) throw notFound('Product not found');
  if (p.seller_id === req.user.id) throw forbidden('You cannot buy your own product');

  const existing = db.prepare('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?').get(req.user.id, productId);
  const newQty = req.body.add && existing ? existing.quantity + qty : qty;
  if (newQty > p.stock) {
    throw conflict('OUT_OF_STOCK', p.stock === 0
      ? `"${p.title}" is out of stock`
      : `Only ${p.stock} of "${p.title}" left${existing ? ` (you have ${existing.quantity} in your cart)` : ''}`);
  }
  if (existing) {
    db.prepare('UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?').run(newQty, req.user.id, productId);
  } else {
    db.prepare('INSERT INTO cart_items (user_id, product_id, quantity, price_when_added) VALUES (?,?,?,?)')
      .run(req.user.id, productId, newQty, p.price_amd);
  }
  res.json(buildCart(req.user.id));
});

r.delete('/cart/items/:productId', (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(req.user.id, int(req.params.productId));
  res.json(buildCart(req.user.id));
});

r.post('/cart/accept-prices', (req, res) => {
  db.prepare(`UPDATE cart_items SET price_when_added = (SELECT price_amd FROM products WHERE id = cart_items.product_id)
              WHERE user_id = ?`).run(req.user.id);
  res.json(buildCart(req.user.id));
});

// ---------------- checkout ----------------
r.post('/orders', (req, res) => {
  const b = req.body;
  const requestKey = str(b.request_key);
  const addr = {
    recipient: str(b.recipient), phone: str(b.phone), region: str(b.region),
    city: str(b.city), street: str(b.street), apartment: str(b.apartment), note: str(b.note).slice(0, 500),
  };
  const details = {};
  if (!addr.recipient) details.recipient = 'Required';
  if (!PHONE_RE.test(addr.phone)) details.phone = 'Enter a valid phone';
  if (!REGIONS.includes(addr.region)) details.region = 'Choose a region';
  if (!addr.city) details.city = 'Required';
  if (!addr.street) details.street = 'Required';
  if (requestKey.length < 8 || requestKey.length > 100) details.request_key = 'Missing request key';
  if (Object.keys(details).length) throw bad('Please fix the highlighted fields', details);

  const userId = req.user.id;

  // The whole checkout is ONE "BEGIN IMMEDIATE" transaction. Any throw rolls everything back.
  const result = immediate(() => {
    // Double click / retry: same request key → return the order that already exists.
    const existing = db.prepare('SELECT id, buyer_id FROM orders WHERE request_key = ?').get(requestKey);
    if (existing) {
      if (existing.buyer_id !== userId) throw conflict('BAD_REQUEST_KEY', 'Request key already used');
      return { id: existing.id, created: false };
    }

    const items = db.prepare(`
      SELECT ci.product_id, ci.quantity, ci.price_when_added, p.title, p.price_amd, p.is_published, p.seller_id
      FROM cart_items ci JOIN products p ON p.id = ci.product_id
      WHERE ci.user_id = ? ORDER BY p.seller_id, p.id`).all(userId);
    if (items.length === 0) throw conflict('EMPTY_CART', 'Your cart is empty');

    for (const it of items) {
      if (!it.is_published) throw conflict('UNAVAILABLE', `"${it.title}" is no longer available. Remove it from your cart.`);
      if (it.seller_id === userId) throw conflict('OWN_PRODUCT', `You cannot buy your own product "${it.title}"`);
      if (it.price_amd !== it.price_when_added) {
        throw conflict('PRICE_CHANGED',
          `The price of "${it.title}" changed from ${fmt(it.price_when_added)} to ${fmt(it.price_amd)}. Please review your cart.`);
      }
    }

    const bySeller = new Map();
    for (const it of items) {
      if (!bySeller.has(it.seller_id)) bySeller.set(it.seller_id, []);
      bySeller.get(it.seller_id).push(it);
    }
    const total = items.reduce((s, it) => s + it.price_amd * it.quantity, 0);
    const ts = now();

    const orderId = db.prepare(`
      INSERT INTO orders (buyer_id, recipient, phone, region, city, street, apartment, note, total_amd, request_key, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      userId, addr.recipient, addr.phone, addr.region, addr.city, addr.street, addr.apartment, addr.note, total, requestKey, ts,
    ).lastInsertRowid;

    const takeStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');
    const insSO = db.prepare(`INSERT INTO seller_orders (order_id, seller_id, status, subtotal_amd, updated_at)
                              VALUES (?,?,'placed',?,?)`);
    const insItem = db.prepare(`INSERT INTO order_items (seller_order_id, product_id, title, unit_price_amd, quantity)
                                VALUES (?,?,?,?,?)`);
    const insHist = db.prepare(`INSERT INTO status_history (seller_order_id, from_status, to_status, changed_by, created_at)
                                VALUES (?, NULL, 'placed', ?, ?)`);

    for (const [sellerId, group] of bySeller) {
      const subtotal = group.reduce((s, it) => s + it.price_amd * it.quantity, 0);
      const soId = insSO.run(orderId, sellerId, subtotal, ts).lastInsertRowid;
      insHist.run(soId, userId, ts);
      for (const it of group) {
        // Atomic stock check: only succeeds if enough stock is left at this moment.
        if (takeStock.run(it.quantity, it.product_id, it.quantity).changes !== 1) {
          throw conflict('OUT_OF_STOCK', `Not enough stock left for "${it.title}"`);
        }
        insItem.run(soId, it.product_id, it.title, it.price_amd, it.quantity); // title & price copied
      }
    }
    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
    return { id: Number(orderId), created: true };
  });

  res.status(result.created ? 201 : 200).json({ order: { id: result.id } });
});

// ---------------- buyer orders ----------------
export function historyFor(soId) {
  return db.prepare(`
    SELECT h.from_status, h.to_status, h.created_at, u.name AS changed_by_name
    FROM status_history h JOIN users u ON u.id = h.changed_by
    WHERE h.seller_order_id = ? ORDER BY h.id`).all(soId);
}

export function itemsFor(soId) {
  return db.prepare(`
    SELECT oi.id, oi.product_id, oi.title, oi.unit_price_amd, oi.quantity,
           (SELECT file_path FROM product_images i WHERE i.product_id = oi.product_id ORDER BY position LIMIT 1) AS main_image
    FROM order_items oi WHERE oi.seller_order_id = ? ORDER BY oi.id`).all(soId)
    .map(({ main_image, ...it }) => ({ ...it, image: imageUrls(main_image) }));
}

r.get('/orders', (req, res) => {
  const orders = db.prepare(`
    SELECT o.id, o.created_at, o.total_amd,
           (SELECT SUM(oi.quantity) FROM order_items oi JOIN seller_orders so ON so.id = oi.seller_order_id
             WHERE so.order_id = o.id) AS item_count
    FROM orders o WHERE o.buyer_id = ? ORDER BY o.id DESC`).all(req.user.id);
  const parts = db.prepare(`
    SELECT so.id, so.status, so.subtotal_amd, u.store_name FROM seller_orders so JOIN users u ON u.id = so.seller_id
    WHERE so.order_id = ? ORDER BY so.id`);
  res.json({
    orders: orders.map((o) => ({
      ...o,
      seller_orders: parts.all(o.id).map((p) => ({
        id: p.id, status: p.status, subtotal_amd: p.subtotal_amd, seller: { store_name: p.store_name },
      })),
    })),
  });
});

function buyerOrder(orderId, userId) {
  // Scoped: WHERE id = ? AND buyer_id = ?  → another buyer's order is simply "not found".
  const o = db.prepare(`SELECT id, created_at, total_amd, recipient, phone, region, city, street, apartment, note
                        FROM orders WHERE id = ? AND buyer_id = ?`).get(orderId, userId);
  if (!o) return null;
  const reviewed = new Set(db.prepare('SELECT product_id FROM reviews WHERE buyer_id = ?').pluck().all(userId));
  const parts = db.prepare(`
    SELECT so.id, so.status, so.subtotal_amd, so.seller_id, u.store_name
    FROM seller_orders so JOIN users u ON u.id = so.seller_id WHERE so.order_id = ? ORDER BY so.id`).all(orderId);
  o.seller_orders = parts.map((p) => ({
    id: p.id,
    status: p.status,
    subtotal_amd: p.subtotal_amd,
    can_cancel: TRANSITIONS[p.status].includes('cancelled'),
    seller: { id: p.seller_id, store_name: p.store_name },
    items: itemsFor(p.id).map((it) => ({
      ...it,
      reviewed: reviewed.has(it.product_id),
      can_review: p.status === 'delivered' && !reviewed.has(it.product_id),
    })),
    history: historyFor(p.id),
  }));
  return o;
}

r.get('/orders/:id', (req, res) => {
  const order = buyerOrder(int(req.params.id), req.user.id);
  if (!order) throw notFound('Order not found');
  res.json({ order });
});

// Shared by buyer cancel and seller status change: one place decides what is allowed.
export function changeStatus(soId, to, actorId) {
  immediate(() => {
    const so = db.prepare('SELECT * FROM seller_orders WHERE id = ?').get(soId);
    if (!TRANSITIONS[so.status].includes(to)) {
      throw conflict('BAD_TRANSITION', `Cannot move an order from "${so.status}" to "${to}"`);
    }
    // "AND status = ?" guards against a concurrent change between the read and the write.
    const ok = db.prepare('UPDATE seller_orders SET status = ?, updated_at = ? WHERE id = ? AND status = ?')
      .run(to, now(), soId, so.status).changes === 1;
    if (!ok) throw conflict('BAD_TRANSITION', 'The order status changed, reload the page');
    if (to === 'cancelled') {
      // Give the stock back in the SAME transaction as the status change.
      db.prepare(`UPDATE products SET stock = stock + (SELECT SUM(quantity) FROM order_items
                    WHERE seller_order_id = ? AND product_id = products.id), updated_at = ?
                  WHERE id IN (SELECT product_id FROM order_items WHERE seller_order_id = ?)`).run(soId, now(), soId);
    }
    db.prepare('INSERT INTO status_history (seller_order_id, from_status, to_status, changed_by, created_at) VALUES (?,?,?,?,?)')
      .run(soId, so.status, to, actorId, now());
  });
}

r.post('/orders/:id/sellers/:sellerOrderId/cancel', (req, res) => {
  const orderId = int(req.params.id);
  const soId = int(req.params.sellerOrderId);
  const owns = db.prepare(`SELECT 1 FROM seller_orders so JOIN orders o ON o.id = so.order_id
                           WHERE so.id = ? AND so.order_id = ? AND o.buyer_id = ?`).get(soId, orderId, req.user.id);
  if (!owns) throw notFound('Order not found');
  changeStatus(soId, 'cancelled', req.user.id);
  res.json({ order: buyerOrder(orderId, req.user.id) });
});

export default r;
