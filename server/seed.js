// Seed: categories, 3 sellers, 40+ products with generated images, 2 demo buyers, a few delivered orders + reviews.
// `npm run seed` resets the demo data in an EMPTY database; the server calls seedIfEmpty() on start.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { db, migrate, now } from './db.js';
import { saveImage } from './lib.js';

const CATEGORIES = [
  ['Electronics', 'electronics', ['#1e3a8a', '#3b82f6']],
  ['Fashion', 'fashion', ['#9d174d', '#f472b6']],
  ['Home & Kitchen', 'home-kitchen', ['#92400e', '#f59e0b']],
  ['Books', 'books', ['#14532d', '#22c55e']],
  ['Beauty', 'beauty', ['#701a75', '#d946ef']],
  ['Sports', 'sports', ['#7c2d12', '#f97316']],
  ['Toys & Kids', 'toys-kids', ['#0f766e', '#2dd4bf']],
  ['Food & Drinks', 'food-drinks', ['#b45309', '#fde047']],
];

// [category slug, title, price AMD, stock, description]
const PRODUCTS = [
  ['electronics', 'Wireless Earbuds Pro', 24900, 25, 'Bluetooth 5.3 earbuds with active noise cancelling, 30 hours of battery with the case and a USB-C charger.'],
  ['electronics', 'Smartphone Stand Aluminium', 6500, 40, 'Adjustable aluminium stand for phones and small tablets. Non-slip silicone pads.'],
  ['electronics', 'Power Bank 20000 mAh', 15900, 18, 'Fast charging power bank with two USB-A ports and one USB-C port. Charges a phone 4–5 times.'],
  ['electronics', 'Mechanical Keyboard RGB', 32000, 9, 'Compact 87-key mechanical keyboard, blue switches, RGB backlight, detachable cable.'],
  ['electronics', 'Smart Watch Fit 3', 45000, 6, 'Heart rate, sleep and step tracking, 7 days of battery, water resistant. Works with Android and iOS.'],
  ['electronics', 'USB-C Hub 7-in-1', 18500, 3, 'HDMI 4K, 3× USB 3.0, SD and microSD card readers, 100 W power delivery.'],
  ['fashion', 'Pomegranate Print T-Shirt', 8900, 30, '100% cotton T-shirt with a hand-drawn pomegranate print. Sizes S–XXL.'],
  ['fashion', 'Wool Winter Scarf', 12500, 14, 'Warm knitted scarf made of Armenian sheep wool. 180 × 30 cm.'],
  ['fashion', 'Leather Wallet Classic', 16000, 11, 'Handmade genuine leather wallet with 8 card slots and a coin pocket.'],
  ['fashion', 'Canvas Backpack', 21000, 2, 'Water-repellent canvas backpack with a padded 15" laptop sleeve.'],
  ['fashion', 'Running Sneakers Air', 38000, 8, 'Lightweight breathable running shoes with a cushioned sole.'],
  ['home-kitchen', 'Copper Jazzve (Coffee Pot)', 9500, 35, 'Traditional hand-hammered copper jazzve for Armenian coffee. 300 ml.'],
  ['home-kitchen', 'Ceramic Plate Set (6 pcs)', 19500, 12, 'Hand-painted ceramic dinner plates with traditional Armenian ornaments.'],
  ['home-kitchen', 'Non-stick Frying Pan 28 cm', 14000, 20, 'Granite-coated non-stick pan suitable for all stoves, including induction.'],
  ['home-kitchen', 'Lavash Baking Sheet', 7000, 9, 'Thin steel baking sheet for homemade lavash and flatbreads.'],
  ['home-kitchen', 'Handwoven Carpet Small', 85000, 2, 'Small handwoven wool carpet, 60 × 90 cm, with a classic Artsakh pattern.'],
  ['home-kitchen', 'Glass Tea Set', 11000, 16, 'Six armudu tea glasses with saucers and a teapot.'],
  ['books', 'Armenian Cookbook', 9800, 22, 'More than 120 recipes: dolma, khorovats, ghapama, gata and more. Full colour photos.'],
  ['books', 'Learn Armenian in 30 Days', 7500, 25, 'A practical course for beginners with audio downloads.'],
  ['books', 'History of Yerevan (Illustrated)', 14500, 7, 'The history of the city from Erebuni to today, with 300 photographs and maps.'],
  ['books', 'Kids Fairy Tales Collection', 6200, 30, 'Classic Armenian fairy tales with colourful illustrations. Ages 4–9.'],
  ['books', 'JavaScript for Beginners', 12900, 10, 'Learn programming step by step: variables, functions, the DOM and small projects.'],
  ['beauty', 'Apricot Kernel Oil', 5900, 40, 'Cold-pressed apricot kernel oil for skin and hair. 100 ml.'],
  ['beauty', 'Natural Honey Soap', 2500, 60, 'Handmade soap with mountain honey and beeswax.'],
  ['beauty', 'Rose Water Toner', 4800, 25, 'Pure rose water toner, alcohol free. 200 ml.'],
  ['beauty', 'Herbal Shampoo', 4200, 3, 'Shampoo with thyme and chamomile extracts from Armenian highlands.'],
  ['beauty', 'Men Grooming Kit', 17500, 9, 'Beard oil, balm, comb and scissors in a gift box.'],
  ['sports', 'Yoga Mat 6 mm', 11500, 15, 'Non-slip TPE yoga mat with carry strap. 183 × 61 cm.'],
  ['sports', 'Adjustable Dumbbells 2×10 kg', 42000, 4, 'Pair of adjustable dumbbells with chrome handles and secure collars.'],
  ['sports', 'Football Size 5', 9000, 20, 'Match-quality football, hand-stitched, for grass and artificial turf.'],
  ['sports', 'Hiking Backpack 40 L', 29000, 7, 'Ideal for trips to Aragats or Dilijan. Rain cover included.'],
  ['sports', 'Jump Rope Speed', 3500, 50, 'Steel cable speed rope with ball bearings and adjustable length.'],
  ['toys-kids', 'Wooden Building Blocks', 13500, 12, '100 natural wooden blocks in a storage box. Safe water-based paints.'],
  ['toys-kids', 'Plush Bear Large', 15000, 5, 'Soft plush teddy bear, 60 cm tall.'],
  ['toys-kids', 'Puzzle Map of Armenia', 6800, 18, '120-piece puzzle with the regions, rivers and mountains of Armenia.'],
  ['toys-kids', 'Remote Control Car', 22000, 1, 'Off-road RC car, 2.4 GHz, rechargeable battery, up to 20 km/h.'],
  ['toys-kids', 'Kids Drawing Set', 8400, 25, '150 pieces: crayons, markers, coloured pencils and watercolours in a case.'],
  ['food-drinks', 'Dried Apricots 1 kg', 6500, 45, 'Sun-dried apricots from the Ararat valley, no added sugar.'],
  ['food-drinks', 'Armenian Brandy 5 years', 18000, 12, 'Aged five years in oak barrels. 0.5 L. For adults only.'],
  ['food-drinks', 'Mountain Herbal Tea Mix', 3200, 40, 'Thyme, mint, rose hip and St John\'s wort gathered in Syunik.'],
  ['food-drinks', 'Sujukh with Walnuts', 4500, 28, 'Traditional walnut and grape juice sweet, 5 pieces.'],
  ['food-drinks', 'Ground Armenian Coffee 500 g', 5600, 33, 'Finely ground coffee, perfect for a jazzve.'],
  ['food-drinks', 'Wildflower Honey 1 kg', 9900, 2, 'Raw honey from the mountains of Tavush.'],
];

// Simple generated product images (no network, no fonts needed): gradient + shapes, a few variations per product.
function svgImage(colors, seed, variant) {
  const rnd = (n) => { seed = (seed * 9301 + 49297) % 233280; return (seed / 233280) * n; };
  const circles = Array.from({ length: 6 }, () =>
    `<circle cx="${rnd(800)}" cy="${rnd(800)}" r="${60 + rnd(180)}" fill="#fff" fill-opacity="${0.06 + rnd(0.14)}"/>`).join('');
  const angle = variant * 60;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
    <defs><linearGradient id="g" gradientTransform="rotate(${angle} .5 .5)">
      <stop offset="0" stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs>
    <rect width="800" height="800" fill="url(#g)"/>${circles}
    <rect x="250" y="250" width="300" height="300" rx="${variant % 2 ? 150 : 40}" fill="#fff" fill-opacity="0.85"/>
    <rect x="310" y="310" width="180" height="180" rx="${variant % 2 ? 90 : 24}" fill="${colors[0]}" fill-opacity="0.85"/>
  </svg>`);
}

export async function seed() {
  migrate();
  if (db.prepare('SELECT COUNT(*) FROM users').pluck().get() > 0) {
    console.log('database is not empty, seed skipped (delete data/ to start fresh)');
    return false;
  }
  console.log('seeding demo data…');
  const hash = bcrypt.hashSync('demo1234', 10);
  const t0 = Date.now() - 40 * 24 * 3600 * 1000;
  const iso = (offsetMin) => new Date(t0 + offsetMin * 60_000).toISOString();

  // 1) images first (slow work outside any transaction)
  const imagesByProduct = [];
  for (let i = 0; i < PRODUCTS.length; i++) {
    const cat = CATEGORIES.find((c) => c[1] === PRODUCTS[i][0]);
    const bases = [];
    const count = 1 + (i % 3);
    for (let v = 0; v < count; v++) {
      const png = await sharp(svgImage(cat[2], i * 7 + v + 1, v)).png().toBuffer();
      bases.push(await saveImage(png));
    }
    imagesByProduct.push(bases);
  }

  // 2) all rows in one transaction
  db.transaction(() => {
    const insCat = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)');
    const catId = {};
    for (const [name, slug] of CATEGORIES) catId[slug] = insCat.run(name, slug).lastInsertRowid;

    const insUser = db.prepare('INSERT INTO users (email, password_hash, name, phone, store_name, created_at) VALUES (?,?,?,?,?,?)');
    const sellers = [
      insUser.run('ani@shuka.am', hash, 'Ani Petrosyan', '+374 91 111111', 'Ani Electronics', iso(0)).lastInsertRowid,
      insUser.run('aram@shuka.am', hash, 'Aram Hakobyan', '+374 93 222222', 'Ararat Home & Style', iso(1)).lastInsertRowid,
      insUser.run('mariam@shuka.am', hash, 'Mariam Sargsyan', '+374 94 333333', 'Mariam Natural', iso(2)).lastInsertRowid,
    ];
    const buyers = [
      insUser.run('buyer1@shuka.am', hash, 'Davit Grigoryan', '+374 95 444444', null, iso(3)).lastInsertRowid,
      insUser.run('buyer2@shuka.am', hash, 'Lilit Avetisyan', '+374 96 555555', null, iso(4)).lastInsertRowid,
    ];
    const sellerFor = { electronics: 0, sports: 0, 'toys-kids': 0, fashion: 1, 'home-kitchen': 1, books: 1, beauty: 2, 'food-drinks': 2 };

    const insP = db.prepare(`INSERT INTO products (seller_id, category_id, title, description, price_amd, stock, is_published,
                             created_at, updated_at) VALUES (?,?,?,?,?,?,1,?,?)`);
    const insImg = db.prepare('INSERT INTO product_images (product_id, file_path, position) VALUES (?,?,?)');
    const productIds = PRODUCTS.map(([slug, title, price, stock, desc], i) => {
      const ts = iso(60 + i * 600);
      const id = insP.run(sellers[sellerFor[slug]], catId[slug], title, desc, price, stock, ts, ts).lastInsertRowid;
      imagesByProduct[i].forEach((b, pos) => insImg.run(id, b, pos));
      return id;
    });

    // A few delivered orders with reviews, so ratings and seller revenue are not empty.
    const insO = db.prepare(`INSERT INTO orders (buyer_id, recipient, phone, region, city, street, apartment, note, total_amd,
                             request_key, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    const insSO = db.prepare(`INSERT INTO seller_orders (order_id, seller_id, status, subtotal_amd, updated_at) VALUES (?,?,?,?,?)`);
    const insOI = db.prepare('INSERT INTO order_items (seller_order_id, product_id, title, unit_price_amd, quantity) VALUES (?,?,?,?,?)');
    const insH = db.prepare('INSERT INTO status_history (seller_order_id, from_status, to_status, changed_by, created_at) VALUES (?,?,?,?,?)');
    const insR = db.prepare('INSERT INTO reviews (product_id, buyer_id, rating, body, created_at) VALUES (?,?,?,?,?)');
    const comments = ['Great quality, fast delivery!', 'Exactly as described.', 'Good value for the price.', 'Nice, would buy again.', 'Okay, but packaging could be better.'];
    const recent = Date.now() - 5 * 24 * 3600 * 1000;
    let n = 0;
    for (let i = 0; i < PRODUCTS.length; i += 3) {
      const buyer = buyers[n % 2];
      const [slug, title, price] = PRODUCTS[i];
      const seller = sellers[sellerFor[slug]];
      const ts = new Date(recent - (20 - n) * 3600_000).toISOString();
      const oid = insO.run(buyer, n % 2 ? 'Lilit Avetisyan' : 'Davit Grigoryan', '+374 95 444444', 'Yerevan', 'Yerevan',
        'Abovyan 10', '5', '', price, `seed-${i}`, ts).lastInsertRowid;
      const so = insSO.run(oid, seller, 'delivered', price, ts).lastInsertRowid;
      insOI.run(so, productIds[i], title, price, 1);
      insH.run(so, null, 'placed', buyer, ts);
      insH.run(so, 'placed', 'confirmed', seller, ts);
      insH.run(so, 'confirmed', 'shipped', seller, ts);
      insH.run(so, 'shipped', 'delivered', seller, ts);
      const rating = 3 + ((i * 7) % 3);
      insR.run(productIds[i], buyer, rating, comments[n % comments.length], ts);
      db.prepare('UPDATE products SET rating_avg = ?, rating_count = 1 WHERE id = ?').run(rating, productIds[i]);
      n++;
    }
  })();
  console.log(`seeded ${PRODUCTS.length} products, 3 sellers, 2 buyers (password: demo1234)`);
  return true;
}

export async function seedIfEmpty() {
  if (db.prepare('SELECT COUNT(*) FROM users').pluck().get() === 0) await seed();
}

// `npm run seed`
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await seed();
