// Break-it tests from the brief. Run against a running server:
//   npm run break-it                         (http://localhost:3000)
//   BASE_URL=https://your-app.onrender.com npm run break-it
import sharp from 'sharp';

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const run = Date.now().toString(36);
let passed = 0, failed = 0;

function check(name, ok, info = '') {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}  ${info}`); }
}

// Tiny HTTP client with its own cookie (one per simulated user).
function client() {
  let cookie = '';
  async function call(method, path, body, isForm) {
    const res = await fetch(BASE + '/api' + path, {
      method,
      headers: { ...(cookie && { cookie }), ...(!isForm && body && { 'content-type': 'application/json' }) },
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    return { status: res.status, data };
  }
  return {
    get: (p) => call('GET', p), post: (p, b) => call('POST', p, b), put: (p, b) => call('PUT', p, b),
    patch: (p, b) => call('PATCH', p, b), del: (p) => call('DELETE', p), form: (p, f) => call('POST', p, f, true),
  };
}

let userN = 0;
async function newUser(label) {
  const c = client();
  const r = await c.post('/auth/register', {
    email: `${label}-${run}-${userN++}@test.am`, password: 'test1234', name: label, phone: '+374 99 000000',
  });
  if (r.status !== 201) throw new Error('register failed ' + JSON.stringify(r.data));
  return c;
}
async function newSeller(label) {
  const c = await newUser(label);
  const r = await c.post('/seller/activate', { store_name: `${label} ${run}`, phone: '+374 99 000001' });
  if (r.status !== 200) throw new Error('activate failed ' + JSON.stringify(r.data));
  return c;
}
const png = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#f97316' } }).png().toBuffer();
async function newProduct(seller, { stock = 10, price = 1000, title = 'Test product' } = {}) {
  const r = await seller.post('/seller/products', {
    title: `${title} ${run}`, description: 'A product created by the break-it script.', category_id: 1, price_amd: price, stock,
  });
  const id = r.data.product.id;
  const fd = new FormData();
  fd.append('images', new Blob([png], { type: 'image/png' }), 'p.png');
  await seller.form(`/seller/products/${id}/images`, fd);
  await seller.patch(`/seller/products/${id}`, { is_published: true });
  return id;
}
const address = { recipient: 'Test Buyer', phone: '+374 99 123456', region: 'Yerevan', city: 'Yerevan', street: 'Tumanyan 1', apartment: '2' };
const key = () => crypto.randomUUID();
async function buy(buyer, productId, quantity = 1) {
  await buyer.put(`/cart/items/${productId}`, { quantity });
  return buyer.post('/orders', { ...address, request_key: key() });
}
const stockOf = async (id) => (await client().get(`/products/${id}`)).data.product.stock;

console.log(`Break-it tests against ${BASE}\n`);
const sellerA = await newSeller('sellerA');
const sellerB = await newSeller('sellerB');

// 1. Last units: stock 3, 30 simultaneous checkouts of 1 unit
{
  console.log('Last units');
  const pid = await newProduct(sellerA, { stock: 3 });
  const buyers = await Promise.all(Array.from({ length: 30 }, (_, i) => newUser('rush' + i)));
  for (const b of buyers) await b.put(`/cart/items/${pid}`, { quantity: 1 });
  const results = await Promise.all(buyers.map((b) => b.post('/orders', { ...address, request_key: key() })));
  const ok = results.filter((r) => r.status === 201).length;
  const conflicts = results.filter((r) => r.status === 409).length;
  const other = results.filter((r) => ![201, 409].includes(r.status));
  check('exactly 3 orders', ok === 3, `got ${ok}`);
  check('27 answers of 409', conflicts === 27, `got ${conflicts}`);
  check('no other errors (no "database is locked")', other.length === 0, JSON.stringify(other[0]));
  check('stock is 0', (await stockOf(pid)) === 0);
}

// 2. Double click: same request key twice
{
  console.log('Double click');
  const pid = await newProduct(sellerA);
  const buyer = await newUser('double');
  await buyer.put(`/cart/items/${pid}`, { quantity: 1 });
  const k = key();
  const [a, b] = await Promise.all([buyer.post('/orders', { ...address, request_key: k }), buyer.post('/orders', { ...address, request_key: k })]);
  const list = await buyer.get('/orders');
  check('same order id returned twice', a.data?.order?.id && a.data.order.id === b.data?.order?.id, JSON.stringify([a, b]));
  check('only one order exists', list.data.orders.length === 1, `got ${list.data.orders.length}`);
}

// 3. Price changed between cart and checkout
let oldOrder;
{
  console.log('Price changed');
  const pid = await newProduct(sellerA, { price: 5000 });
  const buyer = await newUser('price');
  await buyer.put(`/cart/items/${pid}`, { quantity: 1 });
  await sellerA.patch(`/seller/products/${pid}`, { price_amd: 6000 });
  const r = await buyer.post('/orders', { ...address, request_key: key() });
  check('checkout stops with 409 PRICE_CHANGED', r.status === 409 && r.data.error.code === 'PRICE_CHANGED', JSON.stringify(r.data));
  check('message shows the new price', /6 000/.test(r.data?.error?.message || ''), r.data?.error?.message);
  // 4. Old order after edit
  console.log('Old order after edit');
  await buyer.post('/cart/accept-prices');
  const placed = await buyer.post('/orders', { ...address, request_key: key() });
  await sellerA.patch(`/seller/products/${pid}`, { title: 'Renamed product', price_amd: 9999 });
  const o = await buyer.get(`/orders/${placed.data.order.id}`);
  const item = o.data.order.seller_orders[0].items[0];
  check('old order keeps old title', item.title !== 'Renamed product', item.title);
  check('old order keeps old price', item.unit_price_amd === 6000, item.unit_price_amd);
  oldOrder = { buyer, orderId: placed.data.order.id, soId: o.data.order.seller_orders[0].id };
}

// 5. Someone else's order
{
  console.log("Someone else's order");
  const r1 = await sellerB.get(`/seller/orders/${oldOrder.soId}`);
  check('seller B cannot open seller A order', [403, 404].includes(r1.status) && !r1.data.order, r1.status);
  const otherBuyer = await newUser('nosy');
  const r2 = await otherBuyer.get(`/orders/${oldOrder.orderId}`);
  check('buyer B cannot open buyer A order', [403, 404].includes(r2.status) && !r2.data.order, r2.status);
  const r3 = await sellerB.post(`/seller/orders/${oldOrder.soId}/status`, { to: 'confirmed' });
  check('seller B cannot change seller A order', [403, 404].includes(r3.status), r3.status);
}

// 6. Moves not allowed
{
  console.log('Move not allowed');
  const r1 = await sellerA.post(`/seller/orders/${oldOrder.soId}/status`, { to: 'delivered' });
  check('placed → delivered is 409', r1.status === 409, r1.status);
  const still = await sellerA.get(`/seller/orders/${oldOrder.soId}`);
  check('nothing changed', still.data.order.status === 'placed' && still.data.order.history.length === 1);
  await sellerA.post(`/seller/orders/${oldOrder.soId}/status`, { to: 'confirmed' });
  await sellerA.post(`/seller/orders/${oldOrder.soId}/status`, { to: 'shipped' });
  const r2 = await oldOrder.buyer.post(`/orders/${oldOrder.orderId}/sellers/${oldOrder.soId}/cancel`);
  check('buyer cancels shipped order → 409', r2.status === 409, r2.status);
  const r3 = await oldOrder.buyer.post(`/products/1/reviews`, { rating: 5, body: 'x' });
  check('review without delivered item → 403', r3.status === 403, r3.status);
}

// 7. Cancel returns stock
{
  console.log('Cancel returns stock');
  const pid = await newProduct(sellerA, { stock: 10 });
  const buyer = await newUser('cancel');
  const placed = await buy(buyer, pid, 2);
  const before = await stockOf(pid);
  const o = await buyer.get(`/orders/${placed.data.order.id}`);
  await buyer.post(`/orders/${placed.data.order.id}/sellers/${o.data.order.seller_orders[0].id}/cancel`);
  const after = await stockOf(pid);
  check('stock 8 after order, 10 after cancel', before === 8 && after === 10, `${before} → ${after}`);
}

// 8. Foreign keys (only when the database file is on this machine)
if (/localhost|127\.0\.0\.1/.test(BASE)) {
  console.log('Foreign keys');
  const { db } = await import('../server/db.js');
  let rejected = false;
  try {
    db.prepare('INSERT INTO order_items (seller_order_id, product_id, title, unit_price_amd, quantity) VALUES (1, 99999999, ?, 1, 1)').run('ghost');
  } catch (e) { rejected = /FOREIGN KEY/.test(e.message); }
  check('order item for a missing product is rejected by SQLite', rejected);
}

// 9. Bad uploads
{
  console.log('Bad upload');
  const pid = await newProduct(sellerA);
  const big = new FormData();
  big.append('images', new Blob([Buffer.alloc(30 * 1024 * 1024, 1)], { type: 'image/jpeg' }), 'huge.jpg');
  const r1 = await sellerA.form(`/seller/products/${pid}/images`, big);
  check('30 MB file rejected with a message', r1.status === 400 && r1.data?.error?.message, JSON.stringify(r1.data));
  const exe = new FormData();
  exe.append('images', new Blob([Buffer.from('MZ\x90\x00 this is not an image'.repeat(100))], { type: 'image/jpeg' }), 'photo.jpg');
  const r2 = await sellerA.form(`/seller/products/${pid}/images`, exe);
  check('renamed .exe rejected with a message', r2.status === 400 && r2.data?.error?.code === 'BAD_FILE', JSON.stringify(r2.data));
  const r3 = await sellerB.patch(`/seller/products/${pid}`, { price_amd: 1 });
  check("seller B cannot edit seller A's product", r3.status === 404, r3.status);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
