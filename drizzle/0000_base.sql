CREATE TYPE "public"."booking_status" AS ENUM('active', 'cancelled', 'attended', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."booking_source" AS ENUM('site', 'manager');--> statement-breakpoint
CREATE TYPE "public"."actor" AS ENUM('client_site', 'client_bot', 'manager', 'system');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed', 'not_connected', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('screen', 'telegram', 'journal');--> statement-breakpoint
CREATE TYPE "public"."notification_recipient" AS ENUM('client', 'master', 'manager');--> statement-breakpoint
CREATE TYPE "public"."call_reason" AS ENUM('changed');--> statement-breakpoint
CREATE TABLE "masters" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "bio" text,
  "photo" text,
  "telegram_chat_id" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint
CREATE TABLE "services" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "duration_min" integer NOT NULL,
  "buffer_min" integer DEFAULT 15 NOT NULL,
  "price_rub" integer NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint
CREATE TABLE "master_services" (
  "master_id" integer NOT NULL,
  "service_id" integer NOT NULL,
  "duration_min" integer,
  "price_rub" integer,
  CONSTRAINT "master_services_master_id_service_id_pk" PRIMARY KEY("master_id", "service_id")
);--> statement-breakpoint
CREATE TABLE "working_hours" (
  "master_id" integer NOT NULL,
  "weekday" integer NOT NULL,
  "opens_at" time NOT NULL,
  "closes_at" time NOT NULL,
  CONSTRAINT "working_hours_master_id_weekday_pk" PRIMARY KEY("master_id", "weekday"),
  CONSTRAINT "weekday_range" CHECK ("weekday" BETWEEN 0 AND 6),
  CONSTRAINT "working_hours_order" CHECK ("opens_at" < "closes_at")
);--> statement-breakpoint
CREATE TABLE "closures" (
  "id" serial PRIMARY KEY NOT NULL,
  "master_id" integer NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "settings" (
  "id" integer DEFAULT 1 PRIMARY KEY NOT NULL,
  "slot_step_min" integer DEFAULT 30 NOT NULL,
  "min_lead_min" integer DEFAULT 60 NOT NULL,
  "horizon_days" integer DEFAULT 30 NOT NULL,
  "change_cutoff_min" integer DEFAULT 120 NOT NULL,
  "max_client_moves" integer DEFAULT 3 NOT NULL,
  CONSTRAINT "settings_single_row" CHECK ("id" = 1)
);--> statement-breakpoint
CREATE TABLE "clients" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "phone" text UNIQUE,
  "anonymized_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "bookings" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "master_id" integer NOT NULL,
  "service_id" integer NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "occupied_until" timestamp with time zone NOT NULL,
  "price_rub" integer NOT NULL,
  "status" "booking_status" DEFAULT 'active' NOT NULL,
  "source" "booking_source" NOT NULL,
  "move_count" integer DEFAULT 0 NOT NULL,
  "manage_token" text NOT NULL UNIQUE,
  "bot_code" text UNIQUE,
  "idempotency_key" text UNIQUE,
  "warned_at" timestamp with time zone,
  "needs_call" "call_reason",
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "booking_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "booking_id" integer NOT NULL,
  "actor" "actor" NOT NULL,
  "type" text NOT NULL,
  "before" jsonb,
  "after" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "booking_id" integer,
  "recipient" "notification_recipient" NOT NULL,
  "master_id" integer,
  "channel" "notification_channel" NOT NULL,
  "body" text NOT NULL,
  "status" "notification_status" NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sent_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE "client_chats" (
  "chat_id" text NOT NULL,
  "booking_id" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "client_chats_chat_id_booking_id_pk" PRIMARY KEY("chat_id", "booking_id")
);--> statement-breakpoint
CREATE TABLE "request_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "request_log_key_time" ON "request_log" ("key","created_at");--> statement-breakpoint
ALTER TABLE "master_services" ADD CONSTRAINT "master_services_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id");--> statement-breakpoint
ALTER TABLE "master_services" ADD CONSTRAINT "master_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");--> statement-breakpoint
ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id");--> statement-breakpoint
ALTER TABLE "closures" ADD CONSTRAINT "closures_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_master_id_masters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."masters"("id");--> statement-breakpoint
ALTER TABLE "client_chats" ADD CONSTRAINT "client_chats_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id");
