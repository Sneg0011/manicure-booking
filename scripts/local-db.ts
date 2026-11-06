import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const port = Number(process.env.LOCAL_DB_PORT ?? '54320');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Некорректный LOCAL_DB_PORT');
const dir = resolve('.local/pg');
const firstRun = !existsSync(resolve(dir, 'PG_VERSION'));
mkdirSync(dir, { recursive: true });
const pg = new EmbeddedPostgres({
  databaseDir: dir, port, user: 'postgres', password: 'postgres',
  persistent: true, postgresFlags: ['-c', 'io_method=sync'],
});
if (firstRun) await pg.initialise();
await pg.start();
if (firstRun) await pg.createDatabase('manicure');
console.log(`DATABASE_URL=postgres://postgres:postgres@localhost:${port}/manicure`);

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await pg.stop();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
