// `npm run migrate` — applies server/migrations/*.sql in order (the server also does this on start).
import { migrate } from './db.js';
migrate();
console.log('migrations up to date');
