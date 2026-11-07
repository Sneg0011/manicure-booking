import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from '../src/db/client';

declare module 'vitest' {
  export interface ProvidedContext {
    testDbUrl: string;
  }
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('Нет свободного порта'));
      server.close(() => resolve(address.port));
    });
  });
}

/** Запуск на уже работающем Postgres: нужен там, где embedded-postgres не стартует. */
async function setupExternal(adminUrl: string, provide: (key: 'testDbUrl', value: string) => void) {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS booking_template WITH (FORCE)');
  await admin.query(`CREATE DATABASE booking_template ENCODING 'UTF8' LOCALE 'C' TEMPLATE template0`);
  await admin.end();
  const url = new URL(adminUrl);
  url.pathname = '/booking_template';
  const { db, pool } = createDb(url.toString());
  try { await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') }); }
  finally { await pool.end(); }
  provide('testDbUrl', adminUrl);
}

export default async function setup({ provide }: { provide: (key: 'testDbUrl', value: string) => void }) {
  if (process.env.TEST_DATABASE_ADMIN_URL) return setupExternal(process.env.TEST_DATABASE_ADMIN_URL, provide);
  const dir = mkdtempSync(join(tmpdir(), 'manicure-pg-'));
  const port = await freePort();
  let pg: EmbeddedPostgres | undefined;
  let started = false;
  try {
    pg = new EmbeddedPostgres({
      databaseDir: dir, port, user: 'postgres', password: 'postgres',
      persistent: true, postgresFlags: ['-c', 'io_method=sync'],
      onLog: () => {}, onError: () => {},
    });
    await pg.initialise();
    await pg.start();
    started = true;
    // На Windows кластер создаётся в кодировке системы (WIN1251) и не принимает эмодзи.
    // initdb с --encoding=UTF8 падает на кириллице в пути, поэтому UTF-8 задаётся у самой базы.
    const admin = pg.getPgClient();
    await admin.connect();
    await admin.query(`CREATE DATABASE booking_template ENCODING 'UTF8' LOCALE 'C' TEMPLATE template0`);
    await admin.end();
    const url = `postgres://postgres:postgres@127.0.0.1:${port}/booking_template`;
    if (existsSync(join(process.cwd(), 'drizzle', 'meta', '_journal.json'))) {
      const { db, pool } = createDb(url);
      try { await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') }); }
      finally { await pool.end(); }
    }
    provide('testDbUrl', `postgres://postgres:postgres@127.0.0.1:${port}/postgres`);
  } catch (error) {
    try { if (started) await pg?.stop(); }
    finally { rmSync(dir, { recursive: true, force: true }); }
    throw error;
  }
  return async () => {
    try { await pg?.stop(); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  };
}
