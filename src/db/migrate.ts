import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';

export async function migrateDatabase(url: string): Promise<void> {
  const { db, pool } = createDb(url);
  try {
    await migrate(db, { migrationsFolder: resolve('drizzle') });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && /(?:^|[/\\])migrate\.ts$/.test(process.argv[1])) {
  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_DIRECT или DATABASE_URL обязательна');
  await migrateDatabase(url);
}
