import { randomUUID } from 'node:crypto';
import { inject } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Db } from '../../src/db/client';
import * as schema from '../../src/db/schema';

export async function createTestDb(): Promise<{ db: Db; pool: Pool; close(): Promise<void> }> {
  const adminUrl = inject('testDbUrl');
  const name = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: adminUrl });
  try {
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE booking_template`);
  } finally {
    await admin.end();
  }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString(), max: 25 });
  const db = createDbFromPool(pool);
  return {
    db,
    pool,
    async close() {
      await pool.end();
      const cleanup = new Pool({ connectionString: adminUrl });
      try {
        await cleanup.query(`DROP DATABASE "${name}"`);
      } finally {
        await cleanup.end();
      }
    },
  };
}

function createDbFromPool(pool: Pool): Db {
  // Keep the test pool size while using the same Drizzle schema as production.
  return drizzle(pool, { schema });
}
