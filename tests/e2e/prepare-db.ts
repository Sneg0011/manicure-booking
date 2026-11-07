import { Client } from 'pg';
import { migrateDatabase } from '../../src/db/migrate';
import { createDb } from '../../src/db/client';
import { resetDemo } from '../../src/demo/reset';

async function prepare() {
  const adminUrl =
    process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@127.0.0.1:54320/postgres';
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query('DROP DATABASE IF EXISTS manicure_e2e WITH (FORCE)');
    await admin.query("CREATE DATABASE manicure_e2e ENCODING 'UTF8' LOCALE 'C' TEMPLATE template0");
  } finally {
    await admin.end();
  }
  const url = new URL(adminUrl);
  url.pathname = '/manicure_e2e';
  await migrateDatabase(url.toString());
  const { db, pool } = createDb(url.toString());
  try {
    await resetDemo({ db, now: () => new Date() });
  } finally {
    await pool.end();
  }
}

// Запускается до сервера: Playwright ждёт ответа сайта раньше, чем выполняет globalSetup.
await prepare();
