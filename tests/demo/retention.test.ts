import { afterEach, beforeEach, expect, test } from 'vitest';
import type { Pool } from 'pg';
import type { Db } from '../../src/db/client';
import { anonymizeExpired } from '../../src/booking/retention';
import { createTestDb } from '../helpers/db';

let db: Db, pool: Pool, close: () => Promise<void>;
beforeEach(async () => {
  ({ db, pool, close } = await createTestDb());
});
afterEach(async () => {
  if (close) await close();
});

test('anonymizes old last visits and unbooked clients while preserving history', async () => {
  await pool.query("insert into masters(id,name) values (1,'M')");
  await pool.query("insert into services(id,name,duration_min,price_rub) values (1,'S',45,1400)");
  await pool.query(`insert into clients(id,name,phone,created_at) values
    (1,'Old','+70000000001','2020-01-01'),(2,'Recent','+70000000002','2020-01-01'),
    (3,'Future','+70000000003','2020-01-01'),(4,'Unbooked','+70000000004','2020-01-01')`);
  for (const [id, date, status] of [
    [1, '2023-12-07T09:00:00Z', 'attended'],
    [2, '2023-12-09T09:00:00Z', 'attended'],
    [3, '2023-12-07T09:00:00Z', 'attended'],
    [4, '2026-12-10T09:00:00Z', 'active'],
  ] as const) {
    await pool.query(
      `insert into bookings(id,client_id,master_id,service_id,starts_at,ends_at,occupied_until,price_rub,status,source,manage_token)
      values ($1,$2,1,1,$3::timestamptz,$3::timestamptz+interval '45 minutes',$3::timestamptz+interval '60 minutes',1400,$4,'site',$5)`,
      [id, id === 4 ? 3 : id, date, status, `token-${id}`],
    );
  }
  await pool.query(
    "insert into booking_events(booking_id,actor,type) values (1,'system','created')",
  );
  await pool.query(
    "insert into notifications(booking_id,recipient,channel,body,status) values (1,'client','journal','private','sent')",
  );
  await pool.query("insert into client_chats(chat_id,booking_id) values ('111',1)");
  const deps = { db, now: () => new Date('2026-12-08T09:00:00Z') };
  expect(await anonymizeExpired(deps)).toBe(2);
  const clients = (await pool.query('select id,name,phone,anonymized_at from clients order by id'))
    .rows;
  expect(clients[0]).toMatchObject({ name: 'Обезличено', phone: null });
  expect(clients[0].anonymized_at).toBeTruthy();
  expect(clients[1].name).toBe('Recent');
  expect(clients[2].name).toBe('Future');
  expect(clients[3].name).toBe('Обезличено');
  expect((await pool.query('select count(*)::int n from client_chats')).rows[0].n).toBe(0);
  expect((await pool.query('select body from notifications')).rows[0].body).toBe(
    'Текст удалён по сроку хранения',
  );
  expect((await pool.query('select count(*)::int n from booking_events')).rows[0].n).toBe(1);
  expect((await pool.query('select count(*)::int n from bookings')).rows[0].n).toBe(4);
  expect(await anonymizeExpired(deps)).toBe(0);
});
