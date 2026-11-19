// One process: REST API + uploaded images + the built React app.
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, migrate, UPLOADS_DIR } from './db.js';
import { HttpError, loadUser } from './lib.js';
import publicRoutes from './routes/public.js';
import buyerRoutes from './routes/buyer.js';
import sellerRoutes from './routes/seller.js';
import { backupNow, scheduleDailyBackup } from './backup.js';
import { seedIfEmpty } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
migrate();
await seedIfEmpty(); // fresh database (e.g. first deploy) → demo data, so the shop is never empty

const app = express();
app.set('trust proxy', 1); // behind Render / Netlify proxies → correct https detection
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(loadUser);

app.get('/api/health', (_req, res) => res.json({ ok: true, products: db.prepare('SELECT COUNT(*) FROM products').pluck().get() }));
app.use('/api', publicRoutes, buyerRoutes, sellerRoutes);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'No such endpoint')));

app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true }));

const dist = path.join(here, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// The one error shape: { error: { code, message, details? } }
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong' } });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Shuka running on http://localhost:${port}`));
scheduleDailyBackup();
export { backupNow };
