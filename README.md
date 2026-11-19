# Shuka — marketplace for Armenia

Amazon-style marketplace: anyone can register, become a seller, list products with photos, and buy from several
sellers in one cart. Cash on delivery, prices in AMD.

**Stack:** Node.js + Express · SQLite (better-sqlite3, WAL) · React + Vite · sharp for images.
One server process serves the API, the uploaded images and the built frontend.

## Run locally (one command)

```bash
npm run local
```

This installs everything, builds the React app, creates and seeds `data/shuka.db`, and starts
http://localhost:3000.

For frontend development with hot reload: `npm run dev` in one terminal and `npm run dev --prefix client` in another
(Vite on http://localhost:5173 proxies `/api` to port 3000).

### Demo accounts (password `demo1234`)

| Role   | Email            |
|--------|------------------|
| Seller | ani@shuka.am     |
| Seller | aram@shuka.am    |
| Seller | mariam@shuka.am  |
| Buyer  | buyer1@shuka.am  |
| Buyer  | buyer2@shuka.am  |

## Scripts

| Command             | What it does                                                  |
|---------------------|---------------------------------------------------------------|
| `npm run local`     | install + build + seed + start                                |
| `npm start`         | start the server (migrations run automatically)               |
| `npm run migrate`   | apply `server/migrations/*.sql`                               |
| `npm run seed`      | seed demo data into an empty database                         |
| `npm run backup`    | `VACUUM INTO data/backups/shuka-YYYY-MM-DD.db` (also runs daily) |
| `npm run break-it`  | the break-it acceptance tests (`BASE_URL=... npm run break-it` for the live site) |

## How the hard parts are solved

| Problem | Where |
|---|---|
| Overselling | `POST /api/orders` runs in one `BEGIN IMMEDIATE` transaction; `UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?` and the changed-row count is checked (`server/routes/buyer.js`) |
| "Database is locked" | WAL mode + `busy_timeout = 5000`; image resizing happens before any transaction (`server/db.js`) |
| Prices change | title and unit price copied into `order_items`, address into `orders`; checkout returns 409 `PRICE_CHANGED` if the price moved since it was added to the cart |
| One cart, many sellers | one `orders` row → one `seller_orders` row per seller, each with its own status and history |
| Illegal status moves | one `TRANSITIONS` table in `server/lib.js`; everything else → 409; every move inserts into `status_history` (insert-only, enforced by triggers) |
| Other people's data | every query is scoped: `WHERE id = ? AND seller_id = ?` / `AND buyer_id = ?` |
| Double checkout | random `request_key` from the page, `UNIQUE` in `orders`; a repeat returns the existing order |
| Broken references | `PRAGMA foreign_keys = ON` on the connection; products are unpublished, never deleted |
| Images | multer (10 MB limit) + sharp checks the real content, writes a 400px thumb and a 1200px large WebP to `data/uploads/`; SQLite stores only the path |

## Deployment

- **Backend:** Render web service. Build `npm install && npm run build`, start `npm start`.
  Env: `NODE_ENV=production`, `SESSION_SECRET=<long random string>`, `DATA_DIR=/var/data` (persistent disk mounted at `/var/data`).
- **Frontend:** Netlify, configured by `netlify.toml` — it proxies `/api/*` and `/uploads/*` to the Render URL,
  so the session cookie stays first-party.
- Secrets live only in environment variables. A daily backup is written to `$DATA_DIR/backups/`.
