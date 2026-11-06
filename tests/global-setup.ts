import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';
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

export default async function setup({ provide }: { provide: (key: 'testDbUrl', value: string) => void }) {
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
    await pg.createDatabase('booking_template');
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
