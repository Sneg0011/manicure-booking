import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from '../src/db/client';
import { resetDemo } from '../src/demo/reset';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL обязательна');
const { db, pool } = createDb(url);
try {
  await migrate(db, { migrationsFolder: resolve('drizzle') });
  await resetDemo({ db, now: () => new Date() });
} finally {
  await pool.end();
}
