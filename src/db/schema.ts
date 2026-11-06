import { boolean, check, index, integer, jsonb, pgEnum, pgTable, primaryKey, serial, text, time, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const bookingStatus = pgEnum('booking_status', ['active', 'cancelled', 'attended', 'no_show']);
export const bookingSource = pgEnum('booking_source', ['site', 'manager']);
export const actor = pgEnum('actor', ['client_site', 'client_bot', 'manager', 'system']);
export const notificationStatus = pgEnum('notification_status', ['pending', 'sent', 'failed', 'not_connected', 'suppressed']);
export const notificationChannel = pgEnum('notification_channel', ['screen', 'telegram', 'journal']);
export const notificationRecipient = pgEnum('notification_recipient', ['client', 'master', 'manager']);
export const callReason = pgEnum('call_reason', ['changed']);

export const masters = pgTable('masters', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  bio: text('bio'),
  photo: text('photo'),
  telegramChatId: text('telegram_chat_id'),
  isActive: boolean('is_active').notNull().default(true),
  sort: integer('sort').notNull().default(0),
});

export const services = pgTable('services', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  durationMin: integer('duration_min').notNull(),
  bufferMin: integer('buffer_min').notNull().default(15),
  priceRub: integer('price_rub').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  sort: integer('sort').notNull().default(0),
});

export const masterServices = pgTable('master_services', {
  masterId: integer('master_id').notNull().references(() => masters.id),
  serviceId: integer('service_id').notNull().references(() => services.id),
  durationMin: integer('duration_min'),
  priceRub: integer('price_rub'),
}, (table) => [primaryKey({ columns: [table.masterId, table.serviceId] })]);

export const workingHours = pgTable('working_hours', {
  masterId: integer('master_id').notNull().references(() => masters.id),
  weekday: integer('weekday').notNull(), // 0=Sunday, 6=Saturday (getDay)
  opensAt: time('opens_at').notNull(),
  closesAt: time('closes_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.masterId, table.weekday] }),
  check('weekday_range', sql`${table.weekday} BETWEEN 0 AND 6`),
  check('working_hours_order', sql`${table.opensAt} < ${table.closesAt}`),
]);

export const closures = pgTable('closures', {
  id: serial('id').primaryKey(),
  masterId: integer('master_id').notNull().references(() => masters.id),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable('settings', {
  id: integer('id').primaryKey().default(1),
  slotStepMin: integer('slot_step_min').notNull().default(30),
  minLeadMin: integer('min_lead_min').notNull().default(60),
  horizonDays: integer('horizon_days').notNull().default(30),
  changeCutoffMin: integer('change_cutoff_min').notNull().default(120),
  maxClientMoves: integer('max_client_moves').notNull().default(3),
}, (table) => [check('settings_single_row', sql`${table.id} = 1`)]);

export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').unique(),
  anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bookings = pgTable('bookings', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id),
  masterId: integer('master_id').notNull().references(() => masters.id),
  serviceId: integer('service_id').notNull().references(() => services.id),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  occupiedUntil: timestamp('occupied_until', { withTimezone: true }).notNull(),
  priceRub: integer('price_rub').notNull(),
  status: bookingStatus('status').notNull().default('active'),
  source: bookingSource('source').notNull(),
  moveCount: integer('move_count').notNull().default(0),
  manageToken: text('manage_token').notNull().unique(),
  botCode: text('bot_code').unique(),
  idempotencyKey: text('idempotency_key').unique(),
  warnedAt: timestamp('warned_at', { withTimezone: true }),
  needsCall: callReason('needs_call'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bookingEvents = pgTable('booking_events', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id').notNull().references(() => bookings.id),
  actor: actor('actor').notNull(),
  type: text('type').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id').references(() => bookings.id),
  recipient: notificationRecipient('recipient').notNull(),
  masterId: integer('master_id').references(() => masters.id),
  channel: notificationChannel('channel').notNull(),
  body: text('body').notNull(),
  status: notificationStatus('status').notNull(),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
});

export const clientChats = pgTable('client_chats', {
  chatId: text('chat_id').notNull(),
  bookingId: integer('booking_id').notNull().references(() => bookings.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.chatId, table.bookingId] })]);

export const requestLog = pgTable('request_log', {
  id: serial('id').primaryKey(),
  key: text('key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('request_log_key_time').on(table.key, table.createdAt)]);
